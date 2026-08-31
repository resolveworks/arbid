import * as path from "node:path";
import type { CallSite, Definition, DirSymbol, OutlineSymbol } from "../src/db.ts";
import { getCallers, getDefinitions, getSymbols } from "../src/trace.ts";

/** Comparable definition row. */
export interface DefRow {
  name: string;
  node_type: string;
  file: string;
  start_line: number;
  end_line: number;
}

/** Comparable call-site row. */
export interface SiteRow {
  caller: string | null;
  node_type: string | null;
  file: string;
  line: number;
  end_line: number;
}

/** Nested outline node: [name, nodeType, [startLine, endLine], children]. */
export type SymbolNode = [string, string, [number, number], SymbolNode[]];

/** Builder for expected definition rows. */
export function def(
  name: string,
  nodeType: string,
  file: string,
  startLine: number,
  endLine = startLine,
): DefRow {
  return { name, node_type: nodeType, file, start_line: startLine, end_line: endLine };
}

/** Builder for expected call-site rows; a null caller means top level. */
export function site(
  caller: string | null,
  nodeType: string | null,
  file: string,
  line: number,
  endLine = line,
): SiteRow {
  return { caller, node_type: nodeType, file, line, end_line: endLine };
}

/** Builder for expected outline nodes; a bare number is a single-line symbol. */
export function sym(
  name: string,
  nodeType: string,
  range: number | [number, number],
  children: SymbolNode[] = [],
): SymbolNode {
  const [startLine, endLine] = typeof range === "number" ? [range, range] : range;
  return [name, nodeType, [startLine, endLine], children];
}

const byFile = (a: { file: string }, b: { file: string }) =>
  a.file === b.file ? 0 : a.file < b.file ? -1 : 1;

/**
 * Query helpers bound to a base directory: raw results from `src/trace.ts`
 * shaped into sortable, file-relative rows and outline trees.
 */
export function shapers(base: string) {
  const rel = (file: string): string => path.relative(base, file) || ".";

  const definitions = (name: string, scope: string): DefRow[] =>
    getDefinitions(name, scope)
      .map((row: Definition) => ({
        name: row.name,
        node_type: row.node_type,
        file: rel(row.file),
        start_line: row.start_line,
        end_line: row.end_line,
      }))
      .sort((a, b) => byFile(a, b) || a.start_line - b.start_line);

  const callSites = (name: string, scope: string): SiteRow[] =>
    getCallers(name, scope)
      .map((row: CallSite) => ({
        caller: row.caller_name,
        node_type: row.caller_node_type,
        file: rel(row.file),
        line: row.line,
        end_line: row.end_line,
      }))
      .sort((a, b) => byFile(a, b) || a.line - b.line);

  function tree(symbols: OutlineSymbol[]): SymbolNode[] {
    const byParent = new Map<number | null, OutlineSymbol[]>();
    for (const symbol of symbols) {
      const siblings = byParent.get(symbol.parent_id) ?? [];
      siblings.push(symbol);
      byParent.set(symbol.parent_id, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.start_line - b.start_line || a.name.localeCompare(b.name));
    }
    const render = (symbol: OutlineSymbol): SymbolNode => [
      symbol.name,
      symbol.node_type,
      [symbol.start_line, symbol.end_line],
      (byParent.get(symbol.id) ?? []).map(render),
    ];
    return (byParent.get(null) ?? []).map(render);
  }

  /** Outline of a file scope as a nested tree. */
  const fileOutline = (scope: string): SymbolNode[] => tree(getSymbols(scope));

  /** Outline of a directory scope grouped by file, files sorted by path. */
  const directoryOutline = (scope: string): Record<string, SymbolNode[]> => {
    const grouped = new Map<string, OutlineSymbol[]>();
    for (const symbol of getSymbols(scope) as DirSymbol[]) {
      const siblings = grouped.get(symbol.file) ?? [];
      siblings.push(symbol);
      grouped.set(symbol.file, siblings);
    }
    const outline: Record<string, SymbolNode[]> = {};
    for (const file of [...grouped.keys()].sort()) {
      outline[rel(file)] = tree(grouped.get(file) ?? []);
    }
    return outline;
  };

  return { definitions, callSites, fileOutline, directoryOutline };
}
