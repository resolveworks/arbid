import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTrace, initializeTrace } from "../src/trace.ts";
import { createWorkspace } from "./fixtures.ts";
import { def, shapers } from "./helpers.ts";

describe("dependency environments", () => {
  const ws = createWorkspace();
  const { definitions, callSites, directoryOutline } = shapers(ws.projectA);

  beforeAll(() => initializeTrace(ws.database));

  afterAll(() => {
    closeTrace();
    fs.rmSync(ws.root, { recursive: true, force: true });
  });

  it("indexes a pnpm package through its logical symlink path", () => {
    const rows = definitions("dependencyValue", ws.dependency.directory);
    expect(rows).toEqual([
      def("dependencyValue", "function_declaration", "node_modules/dep/index.js", 1, 3),
    ]);
    expect(rows[0].file).not.toBe(ws.dependency.physical);
  });

  it("keeps two directory aliases to one package independently queryable", () => {
    expect(definitions("dependencyValue", ws.dependency.alias)).toEqual([
      def("dependencyValue", "function_declaration", "node_modules/dep-alias/index.js", 1, 3),
    ]);
  });

  it("indexes a gitignored virtual environment when explicitly scoped", () => {
    expect(definitions("environment_value", path.dirname(ws.venvModule))).toEqual([
      def(
        "environment_value",
        "function_definition",
        ".venv/lib/python3.12/site-packages/pkg/mod.py",
        1,
        2,
      ),
    ]);
  });

  it("partitions project and dependency scopes", () => {
    expect(definitions("sharedEnvironmentValue", ws.projectA)).toEqual([
      def("sharedEnvironmentValue", "function_declaration", "shared.ts", 1, 1),
    ]);
    expect(definitions("sharedEnvironmentValue", ws.dependency.directory)).toEqual([
      def("sharedEnvironmentValue", "function_declaration", "node_modules/dep/index.js", 5, 7),
    ]);
    expect(callSites("sharedEnvironmentValue", ws.projectA)).toEqual([]);
  });

  it("excludes dependency environment files from project-scoped outlines", () => {
    const outline = directoryOutline(ws.projectA);
    expect(outline["shared.ts"]).toBeDefined();
    for (const file of Object.keys(outline)) {
      expect(file).not.toContain("node_modules");
      expect(file).not.toContain(".venv");
    }
  });
});
