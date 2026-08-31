import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTrace, getSymbols, initializeTrace } from "../src/trace.ts";
import { createWorkspace } from "./fixtures.ts";
import { def, shapers } from "./helpers.ts";

/**
 * Reconciliation is stateful: these tests mutate the workspace and run in
 * declaration order inside this file. Each file builds an isolated
 * workspace, so other test files are unaffected.
 */
describe("filesystem reconciliation", () => {
  const ws = createWorkspace();
  const { definitions } = shapers(ws.projectA);
  const gitignore = path.join(ws.projectA, ".gitignore");
  const originalGitignore = fs.readFileSync(gitignore, "utf-8");

  beforeAll(() => initializeTrace(ws.database));

  afterAll(() => {
    closeTrace();
    fs.rmSync(ws.root, { recursive: true, force: true });
  });

  it("reconciles changes to a symlink target through the logical path", () => {
    fs.writeFileSync(ws.linked.source, "export function linkedSymbol() {\n  return 2;\n}\n");
    expect(definitions("linkedSymbol", ws.linked.symlink)).toEqual([
      def("linkedSymbol", "function_declaration", "linked.ts", 1, 3),
    ]);
  });

  it("replaces a file scope with a directory", () => {
    const replaced = path.join(ws.projectA, "replaced.ts");
    fs.writeFileSync(replaced, "export function formerFileSymbol() {}\n");
    getSymbols(replaced);
    fs.unlinkSync(replaced);
    fs.mkdirSync(replaced);
    fs.writeFileSync(
      path.join(replaced, "child.ts"),
      "export function directoryChildSymbol() {}\n",
    );
    expect(getSymbols(replaced).map((symbol) => symbol.name)).toEqual(["directoryChildSymbol"]);
  });

  it("replaces a directory scope with a file, removing descendant rows", () => {
    const replaced = path.join(ws.projectA, "replaced.ts");
    fs.rmSync(replaced, { recursive: true });
    fs.writeFileSync(replaced, "export function replacementFileSymbol() {}\n");
    expect(getSymbols(replaced).map((symbol) => symbol.name)).toEqual(["replacementFileSymbol"]);
  });

  it("indexes a file added in a nested directory", () => {
    const nested = path.join(ws.projectA, "nested/deep/nested.ts");
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, "export function nestedSymbol() {}\n");
    expect(definitions("nestedSymbol", ws.projectA)).toEqual([
      def("nestedSymbol", "function_declaration", "nested/deep/nested.ts", 1, 1),
    ]);
  });

  it("reconciles a change in a nested directory", () => {
    const nested = path.join(ws.projectA, "nested/deep/nested.ts");
    fs.writeFileSync(nested, "export function renamedNestedSymbol() {}\n");
    expect(definitions("nestedSymbol", ws.projectA)).toEqual([]);
    expect(definitions("renamedNestedSymbol", ws.projectA)).toEqual([
      def("renamedNestedSymbol", "function_declaration", "nested/deep/nested.ts", 1, 1),
    ]);
  });

  it("removes a deletion in a nested directory", () => {
    fs.unlinkSync(path.join(ws.projectA, "nested/deep/nested.ts"));
    expect(definitions("renamedNestedSymbol", ws.projectA)).toEqual([]);
  });

  it("indexes a newly unignored file", () => {
    fs.writeFileSync(gitignore, originalGitignore.replace("ignored.ts\n", ""));
    expect(definitions("ignoredSymbol", ws.projectA)).toEqual([
      def("ignoredSymbol", "function_declaration", "ignored.ts", 1, 1),
    ]);
  });

  it("re-ignores files when the .gitignore is restored", () => {
    fs.writeFileSync(gitignore, originalGitignore);
    expect(definitions("ignoredSymbol", ws.projectA)).toEqual([]);
  });
});
