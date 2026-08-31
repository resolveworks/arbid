import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function write(base: string, file: string, content: string): string {
  const target = path.join(base, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

const sources = {
  core: [
    "export function target(value: number): number {",
    "  return value + 1;",
    "}",
    "",
    "export class Counter {",
    "  increment(value: number): number {",
    "    return target(value);",
    "  }",
    "}",
    "",
  ].join("\n"),
  javascript: [
    "class Client {",
    "  run() { return api.fetch(); }",
    "}",
    "const build = () => new Client();",
    "",
  ].join("\n"),
  typescript: [
    "interface Service {",
    "  run(input: Input): Output;",
    "}",
    "interface Compact { ping(): void; ping(value: string): void; }",
    "type Input = string;",
    "type Output = Widget;",
    "declare function create(input: Input): Service;",
    "namespace API {",
    "  export function declared(): void;",
    "}",
    "class Widget {}",
    "function build(value: Widget): Service {",
    "  const widget = new Widget();",
    "  service.run(value);",
    "  return widget;",
    "}",
    "function sameLine() { nested(); } topLevel();",
    "",
  ].join("\n"),
  tsx: [
    "function View() {",
    "  return <section>",
    "    <Button />",
    "    <UI.Button></UI.Button>",
    "    <button />",
    "  </section>;",
    "}",
    "",
  ].join("\n"),
  python: [
    "class Worker:",
    "    def work(self):",
    "        helper()",
    "        self.finish()",
    "",
    "def helper():",
    "    return None",
    "",
  ].join("\n"),
  rust: [
    "struct Engine;",
    "enum Mode { Fast }",
    "union Value { integer: i32 }",
    "type EngineAlias = Engine;",
    "trait Runner {}",
    "mod support {}",
    "macro_rules! local_macro { () => {} }",
    "",
    "impl Runner for Engine {",
    "    fn execute(&self) {",
    "        helper();",
    "        self.finish();",
    '        println!("running");',
    "    }",
    "}",
    "",
    "fn helper() {}",
    "",
  ].join("\n"),
  kotlin: [
    "interface Runnable { fun perform(input: String): Boolean }",
    "enum class Mode { FAST, SLOW }",
    "object Registry { fun register(e: Engine) = e }",
    "class Engine(val size: Int) : Runnable {",
    "    companion object { const val MAX = 10 }",
    "    var count: Int = 0",
    "    override fun perform(input: String): Boolean {",
    "        helper()",
    "        this.spinUp()",
    "        return true",
    "    }",
    "    private fun spinUp() { count += 1 }",
    "}",
    "typealias Handler = (String) -> Unit",
    "fun helper(): Unit = Unit",
    "fun main() {",
    "    val e = Engine(4)",
    "    e.run()",
    "    helper()",
    "    Registry.register(e)",
    "}",
    "",
  ].join("\n"),
  php: [
    "<?php",
    "interface Runnable {",
    "    public function perform(string $input): bool;",
    "}",
    "trait Auditable {",
    "    public array $entries = [];",
    "}",
    "enum Status {",
    "    case Active;",
    "    case Retired;",
    "",
    "    public function label(): string {",
    "        return helper($this);",
    "    }",
    "}",
    "class Service implements Runnable {",
    "    use Auditable;",
    "",
    "    public static function create(int $count): self {",
    "        return new Service($count);",
    "    }",
    "",
    "    public function perform(string $input): bool {",
    "        $this->spinUp();",
    "        return true;",
    "    }",
    "",
    "    private function spinUp(): void {",
    "        $this->entries[] = 'x';",
    "    }",
    "}",
    "function helper(Status $status): string {",
    "    return $status->label();",
    "}",
    "function main(): void {",
    "    $service = Service::create(2);",
    "    helper(Status::Active);",
    "    App\\Support\\helper('log');",
    "    $service->perform('in');",
    "}",
    "",
  ].join("\n"),
  dependency: [
    "export function dependencyValue() {",
    "  return 1;",
    "}",
    "",
    "export function sharedEnvironmentValue() {",
    "  return 20;",
    "}",
    "",
    "export function dependencyCaller() {",
    "  return sharedEnvironmentValue();",
    "}",
    "",
  ].join("\n"),
};

export function createWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trace-test-"));
  const home = path.join(root, "home");
  const projectA = path.join(home, "workspace", "project-a");
  const database = path.join(root, "index.sqlite");

  fs.mkdirSync(projectA, { recursive: true });
  const source = write(projectA, "src/a.ts", sources.core);
  const emptyFile = write(projectA, "empty.ts", "// indexed, with no symbols\n");
  const contracts = {
    javascript: write(projectA, "contract/client.js", sources.javascript),
    typescript: write(projectA, "contract/types.ts", sources.typescript),
    tsx: write(projectA, "contract/view.tsx", sources.tsx),
    python: write(projectA, "contract/worker.py", sources.python),
    rust: write(projectA, "contract/engine.rs", sources.rust),
    kotlin: write(projectA, "contract/service.kt", sources.kotlin),
    php: write(projectA, "contract/service.php", sources.php),
  };
  const sharedSource = write(
    projectA,
    "shared.ts",
    "export function sharedEnvironmentValue(): number { return 10; }\n",
  );
  write(projectA, ".gitignore", "ignored.ts\nnode_modules/\n.venv/\n");
  const ignoredFile = write(projectA, "ignored.ts", "export function ignoredSymbol() {}\n");
  const gitMetadataFile = write(
    projectA,
    ".git/internal.ts",
    "export function gitMetadataSymbol() {}\n",
  );

  // A pnpm-style package: physical files under .pnpm, plus two logical
  // directory aliases that must stay independently queryable.
  const dependencyPhysical = write(
    projectA,
    "node_modules/.pnpm/dep@1.0.0/node_modules/dep/index.js",
    sources.dependency,
  );
  const dependencyDirectory = path.join(projectA, "node_modules", "dep");
  fs.symlinkSync(path.dirname(dependencyPhysical), dependencyDirectory, "dir");
  const dependencyLogical = path.join(dependencyDirectory, "index.js");
  const aliasDirectory = path.join(projectA, "node_modules", "dep-alias");
  fs.symlinkSync(path.dirname(dependencyPhysical), aliasDirectory, "dir");
  const dependencyAlias = path.join(aliasDirectory, "index.js");

  const venvModule = write(
    projectA,
    ".venv/lib/python3.12/site-packages/pkg/mod.py",
    "def environment_value():\n    return 12\n",
  );

  const cycleNeighbor = write(
    projectA,
    "cycle/neighbor.ts",
    "export function cycleNeighborSymbol() {}\n",
  );
  fs.symlinkSync(projectA, path.join(projectA, "cycle", "back"), "dir");

  const linkedSource = write(home, "linked/source.ts", "export function linkedSymbol() {}\n");
  const linkedSymlink = path.join(projectA, "linked.ts");
  fs.symlinkSync(linkedSource, linkedSymlink);

  const externalSource = write(
    root,
    "elsewhere/external.ts",
    "export function externalSymbol() { return 42; }\n",
  );
  const externalEmptyDirectory = path.join(root, "elsewhere", "empty");
  fs.mkdirSync(externalEmptyDirectory, { recursive: true });

  return {
    root,
    database,
    projectA,
    source,
    emptyFile,
    contracts,
    sharedSource,
    ignoredFile,
    gitMetadataFile,
    dependency: {
      physical: dependencyPhysical,
      directory: dependencyDirectory,
      logical: dependencyLogical,
      aliasDirectory,
      alias: dependencyAlias,
    },
    venvModule,
    cycle: { neighbor: cycleNeighbor, directory: path.dirname(cycleNeighbor) },
    linked: { source: linkedSource, symlink: linkedSymlink },
    external: { source: externalSource, emptyDirectory: externalEmptyDirectory },
  };
}
