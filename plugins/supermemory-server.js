/**
 * Local loader shim for upstream `opencode-supermemory` (pinned 2.0.15 in
 * package.json/node_modules).
 *
 * Why this file exists: on this opencode (v2.0.22) both config-level
 * specifiers fail — bare `opencode-supermemory[@latest]` resolves the
 * package ROOT, which has no default export (LoadError), and
 * `opencode-supermemory/server` is treated as an npm package name
 * (NpmInstallFailedError). Only the `./server` module itself exports a
 * default definition (verified: keys=["default"]), so this shim re-exports
 * it via a relative file import (bare npm imports at plugin top level do
 * not resolve through opencode's loader pipeline — hence relative, not
 * `opencode-supermemory/server`).
 *
 * If upstream ever ships a default export at root, delete this file and
 * point `plugins[]` back at the package specifier.
 */
export { default } from "../node_modules/opencode-supermemory/dist/server.js";
