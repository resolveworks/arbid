import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTrace, getSymbols, initializeTrace } from "../src/trace.ts";
import { createWorkspace } from "./fixtures.ts";
import { def, shapers, site, sym } from "./helpers.ts";

describe("core queries", () => {
  const ws = createWorkspace();
  const { definitions, callSites, fileOutline, directoryOutline } = shapers(ws.projectA);

  beforeAll(() => initializeTrace(ws.database));

  afterAll(() => {
    closeTrace();
    fs.rmSync(ws.root, { recursive: true, force: true });
  });

  it("finds definitions scoped to a directory", () => {
    expect(definitions("target", ws.projectA)).toEqual([
      def("target", "function_declaration", "src/a.ts", 1, 3),
    ]);
  });

  it("indexes a file symlink scope through its logical path", () => {
    expect(definitions("linkedSymbol", ws.linked.symlink)).toEqual([
      def("linkedSymbol", "function_declaration", "linked.ts", 1, 1),
    ]);
  });

  it("includes file symlinks when reconciling a directory", () => {
    expect(definitions("linkedSymbol", ws.projectA)).toEqual([
      def("linkedSymbol", "function_declaration", "linked.ts", 1, 1),
    ]);
  });

  it("terminates an ancestor symlink cycle without suppressing neighbors", () => {
    expect(definitions("cycleNeighborSymbol", ws.cycle.directory)).toEqual([
      def("cycleNeighborSymbol", "function_declaration", "cycle/neighbor.ts", 1, 1),
    ]);
  });

  it("reports call sites with their enclosing scope", () => {
    expect(callSites("target", ws.source)).toEqual([
      site("increment", "method_definition", "src/a.ts", 7, 7),
    ]);
  });

  it("outlines a file as a nested symbol tree", () => {
    expect(fileOutline(ws.source)).toEqual([
      sym("target", "function_declaration", [1, 3]),
      sym("Counter", "class_declaration", [5, 9], [sym("increment", "method_definition", [6, 8])]),
    ]);
  });

  it("outlines a directory grouped by file", () => {
    expect(directoryOutline(path.dirname(ws.source))).toEqual({
      "src/a.ts": [
        sym("target", "function_declaration", [1, 3]),
        sym(
          "Counter",
          "class_declaration",
          [5, 9],
          [sym("increment", "method_definition", [6, 8])],
        ),
      ],
    });
  });

  it("accepts an arbitrary absolute file scope outside the project", () => {
    expect(definitions("externalSymbol", ws.external.source)).toEqual([
      def("externalSymbol", "function_declaration", "../../../elsewhere/external.ts", 1, 1),
    ]);
  });

  it("returns no symbols for an indexed file without symbols", () => {
    expect(getSymbols(ws.emptyFile)).toEqual([]);
  });

  it("treats an empty directory as a valid scope", () => {
    expect(getSymbols(ws.external.emptyDirectory)).toEqual([]);
  });

  it("rejects a gitignored file scope", () => {
    expect(() => getSymbols(ws.ignoredFile)).toThrow(/file is not accepted source/);
  });

  it("rejects .git logical routes", () => {
    expect(() => getSymbols(ws.gitMetadataFile)).toThrow(/file is not accepted source/);
  });
});
