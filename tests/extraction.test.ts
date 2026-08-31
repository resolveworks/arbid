import * as fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTrace, initializeTrace } from "../src/trace.ts";
import { createWorkspace } from "./fixtures.ts";
import { def, shapers, site, sym } from "./helpers.ts";

describe("extraction contracts", () => {
  const ws = createWorkspace();
  const { definitions, callSites, fileOutline } = shapers(ws.projectA);

  beforeAll(() => initializeTrace(ws.database));

  afterAll(() => {
    closeTrace();
    fs.rmSync(ws.root, { recursive: true, force: true });
  });

  describe("JavaScript", () => {
    it("extracts definitions, methods, member calls, and constructors", () => {
      expect(fileOutline(ws.contracts.javascript)).toEqual([
        sym("Client", "class_declaration", [1, 3], [sym("run", "method_definition", 2)]),
        sym("build", "variable_declarator", 4),
      ]);
      expect(callSites("fetch", ws.contracts.javascript)).toEqual([
        site("run", "method_definition", "contract/client.js", 2, 2),
      ]);
      expect(callSites("Client", ws.contracts.javascript)).toEqual([
        site("build", "variable_declarator", "contract/client.js", 4, 4),
      ]);
    });
  });

  describe("TypeScript", () => {
    it("outlines interfaces, signatures, types, modules, classes, and functions", () => {
      expect(fileOutline(ws.contracts.typescript)).toEqual([
        sym("Service", "interface_declaration", [1, 3], [sym("run", "method_signature", 2)]),
        sym("Compact", "interface_declaration", 4, [
          sym("ping", "method_signature", 4),
          sym("ping", "method_signature", 4),
        ]),
        sym("Input", "type_alias_declaration", 5),
        sym("Output", "type_alias_declaration", 6),
        sym("create", "function_signature", 7),
        sym("API", "internal_module", [8, 10], [sym("declared", "function_signature", 9)]),
        sym("Widget", "class_declaration", 11),
        sym("build", "function_declaration", [12, 16]),
        sym("sameLine", "function_declaration", 17),
      ]);
    });

    it("counts constructors as callers but not type annotations", () => {
      expect(callSites("Widget", ws.contracts.typescript)).toEqual([
        site("build", "function_declaration", "contract/types.ts", 13, 13),
      ]);
      expect(callSites("Input", ws.contracts.typescript)).toEqual([]);
    });

    it("assigns same-line calls by syntax boundaries rather than line range", () => {
      expect(callSites("nested", ws.contracts.typescript)).toEqual([
        site("sameLine", "function_declaration", "contract/types.ts", 17, 17),
      ]);
      expect(callSites("topLevel", ws.contracts.typescript)).toEqual([
        site(null, null, "contract/types.ts", 17, 17),
      ]);
    });
  });

  describe("TSX", () => {
    it("matches simple and member component tags without closers or intrinsics", () => {
      expect(callSites("Button", ws.contracts.tsx)).toEqual([
        site("View", "function_declaration", "contract/view.tsx", 3, 3),
        site("View", "function_declaration", "contract/view.tsx", 4, 4),
      ]);
      expect(callSites("button", ws.contracts.tsx)).toEqual([]);
    });
  });

  describe("Python", () => {
    it("extracts classes, functions, and direct and member calls", () => {
      expect(fileOutline(ws.contracts.python)).toEqual([
        sym("Worker", "class_definition", [1, 4], [sym("work", "function_definition", [2, 4])]),
        sym("helper", "function_definition", [6, 7]),
      ]);
      expect(callSites("helper", ws.contracts.python)).toEqual([
        site("work", "function_definition", "contract/worker.py", 3, 3),
      ]);
      expect(callSites("finish", ws.contracts.python)).toEqual([
        site("work", "function_definition", "contract/worker.py", 4, 4),
      ]);
    });
  });

  describe("Rust", () => {
    it("extracts types, functions, methods, macros, and calls without impl references", () => {
      expect(fileOutline(ws.contracts.rust)).toEqual([
        sym("Engine", "struct_item", 1),
        sym("Mode", "enum_item", 2),
        sym("Value", "union_item", 3),
        sym("EngineAlias", "type_item", 4),
        sym("Runner", "trait_item", 5),
        sym("support", "mod_item", 6),
        sym("local_macro", "macro_definition", 7),
        sym("execute", "function_item", [10, 14]),
        sym("helper", "function_item", 17),
      ]);
      expect(callSites("helper", ws.contracts.rust)).toEqual([
        site("execute", "function_item", "contract/engine.rs", 11, 11),
      ]);
      expect(callSites("finish", ws.contracts.rust)).toEqual([
        site("execute", "function_item", "contract/engine.rs", 12, 12),
      ]);
      expect(callSites("println", ws.contracts.rust)).toEqual([
        site("execute", "function_item", "contract/engine.rs", 13, 13),
      ]);
      expect(callSites("Runner", ws.contracts.rust)).toEqual([]);
    });
  });

  describe("Kotlin", () => {
    it("captures classes, objects, enum entries, properties, and calls exactly once", () => {
      expect(fileOutline(ws.contracts.kotlin)).toEqual([
        sym("Runnable", "class_declaration", 1, [sym("perform", "function_declaration", 1)]),
        sym("Mode", "class_declaration", 2, [
          sym("FAST", "enum_entry", 2),
          sym("SLOW", "enum_entry", 2),
        ]),
        sym("Registry", "object_declaration", 3, [sym("register", "function_declaration", 3)]),
        sym(
          "Engine",
          "class_declaration",
          [4, 13],
          [
            sym("MAX", "property_declaration", 5),
            sym("count", "property_declaration", 6),
            sym("perform", "function_declaration", [7, 11]),
            sym("spinUp", "function_declaration", 12),
          ],
        ),
        sym("Handler", "type_alias", 14),
        sym("helper", "function_declaration", 15),
        sym("main", "function_declaration", [16, 21]),
      ]);
      expect(callSites("helper", ws.contracts.kotlin)).toEqual([
        site("perform", "function_declaration", "contract/service.kt", 8, 8),
        site("main", "function_declaration", "contract/service.kt", 19, 19),
      ]);
      expect(callSites("spinUp", ws.contracts.kotlin)).toEqual([
        site("perform", "function_declaration", "contract/service.kt", 9, 9),
      ]);
      expect(callSites("Engine", ws.contracts.kotlin)).toEqual([
        site("main", "function_declaration", "contract/service.kt", 17, 17),
      ]);
      expect(callSites("Registry", ws.contracts.kotlin)).toEqual([]);
      expect(callSites("String", ws.contracts.kotlin)).toEqual([]);
    });
  });

  describe("PHP", () => {
    it("captures classes, enums, traits, properties, and all call forms exactly once", () => {
      expect(fileOutline(ws.contracts.php)).toEqual([
        sym("Runnable", "interface_declaration", [2, 4], [sym("perform", "method_declaration", 3)]),
        sym("Auditable", "trait_declaration", [5, 7], [sym("entries", "property_declaration", 6)]),
        sym(
          "Status",
          "enum_declaration",
          [8, 15],
          [
            sym("Active", "enum_case", 9),
            sym("Retired", "enum_case", 10),
            sym("label", "method_declaration", [12, 14]),
          ],
        ),
        sym(
          "Service",
          "class_declaration",
          [16, 31],
          [
            sym("create", "method_declaration", [19, 21]),
            sym("perform", "method_declaration", [23, 26]),
            sym("spinUp", "method_declaration", [28, 30]),
          ],
        ),
        sym("helper", "function_definition", [32, 34]),
        sym("main", "function_definition", [35, 40]),
      ]);
      expect(definitions("Service", ws.contracts.php)).toEqual([
        def("Service", "class_declaration", "contract/service.php", 16, 31),
      ]);
      expect(callSites("helper", ws.contracts.php)).toEqual([
        site("label", "method_declaration", "contract/service.php", 13, 13),
        site("main", "function_definition", "contract/service.php", 37, 37),
        site("main", "function_definition", "contract/service.php", 38, 38),
      ]);
      expect(callSites("label", ws.contracts.php)).toEqual([
        site("helper", "function_definition", "contract/service.php", 33, 33),
      ]);
      expect(callSites("create", ws.contracts.php)).toEqual([
        site("main", "function_definition", "contract/service.php", 36, 36),
      ]);
      expect(callSites("Service", ws.contracts.php)).toEqual([
        site("create", "method_declaration", "contract/service.php", 20, 20),
      ]);
      expect(callSites("Runnable", ws.contracts.php)).toEqual([]);
      expect(callSites("entries", ws.contracts.php)).toEqual([]);
    });
  });
});
