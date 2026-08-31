import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { Parser, type Node as SyntaxNode } from "web-tree-sitter";
import {
  deleteFiles,
  type FileStat,
  getFileStatsInScope,
  insertCall,
  insertSymbol,
  replaceFile,
  sameStat,
  updateSymbolParent,
} from "./db.ts";
import { isPathMissing } from "./fs-errors.ts";
import { getLanguageForFile, initializeLanguages, type LoadedLang } from "./languages.ts";
import type { SourceFilter } from "./source-filter.ts";
import { walkSourceFiles } from "./traverse.ts";

let parser: Parser | null = null;

/** Initialize the parser after the WASM runtime and grammars are ready. */
export async function initializeIndexer(): Promise<void> {
  if (parser) throw new Error("tree-sitter indexer is already initialized");
  await initializeLanguages();
  parser = new Parser();
}

export function closeIndexer(): void {
  getParser().delete();
  parser = null;
}

function getParser(): Parser {
  if (!parser) throw new Error("tree-sitter indexer is not initialized");
  return parser;
}

/** Reconcile one directory and remove stale rows within the same query domain. */
export function reconcileDirectory(filter: SourceFilter, dir: string): void {
  getParser();
  let files: string[];
  try {
    files = walkSourceFiles(filter, dir);
  } catch (error) {
    if (!isPathMissing(error)) throw error;
    files = [];
  }

  const includeEnvironments = filter.isEnvironmentPath(dir);
  const indexed = getFileStatsInScope(dir, includeEnvironments);
  const present = new Set<string>();

  for (const file of files) {
    try {
      const stat = statSourceFile(file);
      const current = indexed.get(file);
      if (!current || !sameStat(current, stat)) indexSourceFile(filter, file, stat);
      present.add(file);
    } catch (error) {
      if (!isPathMissing(error)) throw error;
    }
  }

  deleteFiles([...indexed.keys()].filter((file) => !present.has(file)));
}

/** Reconcile one exact file scope, including stale rows from a replaced directory. */
export function reconcileFile(filter: SourceFilter, file: string): boolean {
  getParser();
  const indexed = getFileStatsInScope(file, true);
  const cachedPaths = [...indexed.keys()];
  const descendants = cachedPaths.filter((candidate) => candidate !== file);

  if (!filter.includesFile(file)) {
    deleteFiles(cachedPaths);
    return false;
  }

  try {
    const stat = statSourceFile(file);
    const current = indexed.get(file);
    if (!current || !sameStat(current, stat)) indexSourceFile(filter, file, stat);
    deleteFiles(descendants);
    return true;
  } catch (error) {
    if (!isPathMissing(error)) throw error;
    deleteFiles(cachedPaths);
    return false;
  }
}

/** Freshness hint for a source file, following symlinks to their targets. */
function statSourceFile(file: string): FileStat {
  const stats = fs.statSync(file, { bigint: true });
  if (!stats.isFile()) throw new Error(`not a regular file: ${file}`);
  return { size: stats.size, mtimeNs: stats.mtimeNs };
}

/**
 * Point a file at its content, parsing only when the content has never been
 * seen. Identical bytes under the same grammar at distinct indexed paths
 * share one content row.
 */
function indexSourceFile(filter: SourceFilter, file: string, stat: FileStat): void {
  const lang = getLanguageForFile(file);
  if (!lang) throw new Error(`unsupported source file: ${file}`);
  const source = fs.readFileSync(file, "utf-8");
  const hash = createHash("sha256").update(source).digest("hex");
  replaceFile(file, stat, hash, lang.name, filter.isEnvironmentPath(file), (contentId) => {
    const activeParser = getParser();
    activeParser.setLanguage(lang.language);
    const tree = activeParser.parse(source);
    if (!tree) throw new Error(`failed to parse source file: ${file}`);
    try {
      extractFromTree(tree.rootNode, contentId, lang, file);
    } finally {
      tree.delete();
    }
  });
}

interface ExtractedDef {
  dbId: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Apply the extraction contract: every match captures @name plus exactly one of
 * @definition or @reference.call. Violations fail loudly instead of silently
 * indexing nothing.
 */
function extractFromTree(
  root: SyntaxNode,
  contentId: number,
  lang: LoadedLang,
  file: string,
): void {
  const definitions: ExtractedDef[] = [];
  const refBuffer: { refNode: SyntaxNode; nameNode: SyntaxNode }[] = [];

  for (const match of lang.query.matches(root)) {
    const captured = new Map<string, SyntaxNode>();
    for (const capture of match.captures) {
      if (
        capture.name !== "definition" &&
        capture.name !== "reference.call" &&
        capture.name !== "name"
      ) {
        throw new Error(`unexpected @${capture.name} capture: ${file}`);
      }
      if (captured.has(capture.name)) {
        throw new Error(`duplicate @${capture.name} capture in one match: ${file}`);
      }
      captured.set(capture.name, capture.node);
    }

    const defNode = captured.get("definition") ?? null;
    const refNode = captured.get("reference.call") ?? null;
    const nameNode = captured.get("name") ?? null;
    if (defNode && refNode) {
      throw new Error(`match captured both @definition and @reference.call: ${file}`);
    }
    const siteNode = defNode ?? refNode;
    if (!siteNode || !nameNode) {
      throw new Error(
        `match must capture @name and exactly one of @definition or @reference.call: ${file}`,
      );
    }

    if (defNode) {
      const dbId = insertSymbol(
        contentId,
        nameNode.text,
        defNode.type,
        defNode.startPosition.row + 1,
        defNode.endPosition.row + 1,
      );
      definitions.push({
        dbId,
        startIndex: defNode.startIndex,
        endIndex: defNode.endIndex,
      });
    } else {
      refBuffer.push({ refNode: siteNode, nameNode });
    }
  }

  for (const definition of definitions) {
    const parent = findEnclosingDef(definition.startIndex, definition.endIndex, definitions);
    if (parent) updateSymbolParent(definition.dbId, parent.dbId);
  }

  for (const { refNode, nameNode } of refBuffer) {
    const line = refNode.startPosition.row + 1;
    const parent = findEnclosingDef(refNode.startIndex, refNode.endIndex, definitions);
    insertCall(contentId, parent?.dbId ?? null, nameNode.text, line, refNode.endPosition.row + 1);
  }
}

function findEnclosingDef(
  startIndex: number,
  endIndex: number,
  definitions: ExtractedDef[],
): ExtractedDef | null {
  let best: ExtractedDef | null = null;
  let bestSize = Infinity;
  for (const definition of definitions) {
    const strictlyContains =
      startIndex >= definition.startIndex &&
      endIndex <= definition.endIndex &&
      (startIndex > definition.startIndex || endIndex < definition.endIndex);
    if (strictlyContains) {
      const size = definition.endIndex - definition.startIndex;
      if (size < bestSize) {
        bestSize = size;
        best = definition;
      }
    }
  }
  return best;
}
