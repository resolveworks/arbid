# trace

Trace is a Pi extension that provides deterministic `def`, `callers`, and `outline` tools using tree-sitter and a persistent SQLite index. It supports JavaScript, TypeScript/TSX, Python, Rust, Kotlin, and PHP.

## Development

Requires Node.js 22.18 or newer and pnpm 11.3.0.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm format:check
```

Use `pnpm format` to apply formatting. Run typecheck, tests, and the formatting check before finishing a change.

## Code organization

- `extensions/index.ts` registers the Pi tools and renders their results.
- `src/trace.ts` is the entry point for scope reconciliation and database queries.
- `src/traverse.ts` and `src/source-filter.ts` own filesystem traversal and filtering.
- `src/indexer.ts` owns parsing and extraction.
- `src/db.ts` owns the persistent index and scoped SQL queries.
- `queries/` contains the tree-sitter extraction contracts.
- `tests/fixtures.ts` builds isolated workspace fixtures; `tests/helpers.ts` shapes query results into comparable rows; the `*.test.ts` files cover core queries, per-language extraction contracts, dependency environments, and filesystem reconciliation.

## Implementation constraints

- Keep `callers` syntactic. Do not introduce type analysis, import resolution, alias resolution, or other semantic indexing.
- Preserve logical paths throughout filtering, caching, and results. Do not replace them with resolved physical paths.
- File symlinks to regular files are indexed at their logical paths. Directory symlinks are traversed, with physical identity used only to stop cycles on the current traversal branch. Independent logical aliases remain independently queryable.
- Project scopes must not enter `node_modules` or `.venv`; those environments are indexed only when explicitly scoped. Logical routes containing `.git` are always excluded.
- Cache files by logical path and share parsed content by content hash and language. File stats are only a freshness hint for skipping unchanged files.
- Treat only `ENOENT` and `ENOTDIR` reconciliation races as absence. Propagate other traversal, parsing, and database failures.
- Tree-sitter queries use `@definition`, `@reference.call`, and `@name`. Each definition and call site must match exactly once; extraction does not deduplicate query matches. Definition types come from the captured node's tree-sitter `Node.type`.
- The SQLite cache has no migrations, versioning, startup recovery, or automatic deletion. After changing its schema or extraction contract, stop active Trace sessions and manually remove `~/.pi/agent/extensions/trace/index.sqlite`, `index.sqlite-shm`, and `index.sqlite-wal`.

## Testing

Tests are vitest files that drive the public API in `src/trace.ts` (`initializeTrace`, `getDefinitions`, `getCallers`, `getSymbols`, `closeTrace`) — no Pi runtime is involved. `extensions/index.ts` is a thin typed adapter over that API and is covered by typecheck, not tests. Each test file builds its own workspace and database via `createWorkspace()`; vitest runs files in isolated processes, so per-file state never leaks. Assert on structured results, not rendered markdown. Reconciliation tests are sequential within their file and mutate their own workspace. Keep the suite focused on public contracts and important filesystem boundaries; refactoring without a behavior change should not require test changes.
