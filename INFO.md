# OpenCode Configuration Engineering Guide

This document is the implementation guide for the `~/.config/opencode` package in this repository.

It is intended for anyone who needs to modify, extend, debug, or re-platform the setup without re-reading every file from scratch.

## 1. Purpose

This configuration package exists to make `opencode` work well for:

- large monorepos
- long-running coding sessions
- multi-language repositories
- external documentation lookups
- durable project memory
- reproducible setup on fresh machines

The package has three design goals:

1. Keep secrets out of git.
2. Keep the runtime config explicit and inspectable.
3. Keep the install path deterministic enough that another machine can reproduce the same setup quickly.

## 2. Directory map

Top-level files:

- `opencode.jsonc`
  Main runtime configuration consumed by OpenCode.
- `tui.jsonc`
  TUI-only config such as theme and scroll behavior.
- `package.json`
  Local dependency manifest for provider support and LSP servers.
- `package-lock.json`
  Reproducible npm dependency lockfile.
- `install.sh`
  Portable installer and local bootstrap.
- `README.md`
  Human quick-start guide.
- `INFO.md`
  This engineering guide.

Subdirectories:

- `agents/`
  File-based custom subagents loaded by OpenCode.
- `instructions/`
  Global instruction files always injected via `opencode.jsonc`.
- `themes/`
  Custom OpenCode theme definitions.
- `bin/`
  Wrapper executables for language servers.
- `local/`
  Ignored local secret and endpoint files created by the installer.

Ignored paths:

- `local/`
- `node_modules/`
- optional local memory config and logs

## 3. Runtime architecture

The package is built around `opencode.jsonc`.

That file configures:

- enabled providers
- default model selection
- compaction behavior
- watcher ignore rules
- MCP servers
- file-based instructions
- LSP servers
- custom commands
- inline agent overrides

OpenCode merges configuration from multiple locations, but this package is intended to be the primary global config at:

- `~/.config/opencode/opencode.jsonc`

OpenCode also automatically loads:

- `~/.config/opencode/agents/*.md`
- `~/.config/opencode/themes/*.json`
- project-local rule files referenced in `instructions`

## 4. Provider design

There are two configured providers.

### 4.1 `nano-gpt`

Purpose:

- primary hosted provider
- broad model catalog
- curated set of explicitly-defined models with known limits

Implementation details:

- Provider ID: `nano-gpt`
- SDK package: `@ai-sdk/openai-compatible`
- Secrets and endpoint are file-backed, not committed
- Config source:
  - `local/nanogpt-base-url`
  - `local/nanogpt-api-key`

Why file-backed instead of inline literals:

- keeps tokens and endpoints out of git history
- avoids leaking secrets through accidental commit or copy/paste
- lets per-machine overrides happen without touching tracked config

The current NanoGPT model table is intentionally curated rather than exhaustive. Only the models that are strategically useful for this setup are defined explicitly.

Why explicit model definitions exist:

- OpenCode needs accurate context and output token limits for compaction decisions
- explicit capability flags improve tool-use behavior
- the curated set reduces model list noise for common usage

### 4.2 `local-vpn`

Purpose:

- expose a local OpenAI-compatible route that is reachable through the machine’s VPN path
- mirror the full set of models currently exposed by that route

Implementation details:

- Provider ID: `local-vpn`
- SDK package: `@ai-sdk/openai-compatible`
- Local endpoint file:
  - `local/local-vpn-base-url`
- Local key file:
  - `local/local-vpn-api-key`
- Default seeded URL:
  - `http://localhost:4141/`
- Default seeded API key:
  - `local-vpn-routing-placeholder-key`

The placeholder key is intentionally non-sensitive and exists because many OpenAI-compatible gateways require an `Authorization` header even when they do not verify a real upstream credential.

The source of truth for this provider is:

- `http://localhost:4141/v1/models`

The config now mirrors all 42 unique IDs currently returned by that endpoint.

Current mirrored IDs:

- `claude-opus-4.6-fast`
- `claude-opus-4.6`
- `claude-sonnet-4.6`
- `gemini-3.1-pro-preview`
- `gpt-5.2-codex`
- `gpt-5.3-codex`
- `gpt-5.4-mini`
- `gpt-5.4`
- `gpt-5-mini`
- `gpt-4o-mini-2024-07-18`
- `gpt-4o-2024-11-20`
- `gpt-4o-2024-08-06`
- `grok-code-fast-1`
- `gpt-5.1`
- `gpt-5.1-codex`
- `gpt-5.1-codex-mini`
- `gpt-5.1-codex-max`
- `text-embedding-3-small`
- `text-embedding-3-small-inference`
- `claude-sonnet-4`
- `claude-sonnet-4.5`
- `claude-opus-4.5`
- `claude-haiku-4.5`
- `gemini-3-pro-preview`
- `gemini-3-flash-preview`
- `gemini-2.5-pro`
- `gpt-4.1-2025-04-14`
- `oswe-vscode-prime`
- `oswe-vscode-secondary`
- `gpt-5.2`
- `gpt-41-copilot`
- `gpt-3.5-turbo-0613`
- `gpt-4`
- `gpt-4-0613`
- `gpt-4-0125-preview`
- `gpt-4o-2024-05-13`
- `gpt-4-o-preview`
- `gpt-4.1`
- `gpt-3.5-turbo`
- `gpt-4o-mini`
- `gpt-4o`
- `text-embedding-ada-002`

Important implementation note:

- the route only exposes stable IDs, display names, and owners
- it does not expose context limits, output limits, or pricing
- the local-vpn model entries are intentionally lightweight to avoid inventing unsupported metadata

If the endpoint changes, regenerate the local-vpn catalog from the live route instead of hand-editing it from memory.

## 5. Model selection strategy

Current defaults:

- `model`: `nano-gpt/xiaomi/mimo-v2-pro`
- `small_model`: `nano-gpt/xiaomi/mimo-v2-flash`
- `permission`: `allow`

Why:

- `mimo-v2-pro` is used as the main general-purpose model for the default path, built-in agents, and bundled commands
- `mimo-v2-flash` is used for smaller support paths and quick-turn tasks
- explicit `permission: allow` keeps the config in yolo mode across machines

Additional curated models are present to support:

- higher coding intensity
- lower cost fallback
- stronger thinking variants
- alternate vendor behavior when one provider struggles with a repository

When changing defaults:

1. Prefer models with explicit `limit.context` and `limit.output`.
2. Keep at least one cheap `small_model`.
3. Verify tool-calling support if the model is expected to drive edits or searches.
4. Avoid changing both the primary and small model simultaneously without testing compaction behavior.

## 6. Token and large-project optimization

The large-project tuning is spread across several sections.

### 6.1 Compaction

Configured in:

- `opencode.jsonc` → `compaction`

Current values:

- `auto: true`
- `prune: true`
- `reserved: 24000`

Rationale:

- auto-compaction avoids hard context failure in long sessions
- pruning old tool output reduces low-value token carryover
- the reserved token buffer is intentionally larger than a minimal default because multi-step edits plus tool output can spike usage in large repos

### 6.2 Watcher noise control

Configured in:

- `opencode.jsonc` → `watcher.ignore`

Purpose:

- stop noisy build and dependency directories from polluting file change tracking
- reduce unnecessary filesystem churn in large repositories

The ignore list intentionally covers:

- dependency trees
- compiler/build output
- cache directories
- Python caches
- iOS/macOS derived artifacts
- generic monorepo output directories

### 6.3 Snapshot behavior

Configured in:

- `opencode.jsonc` → `snapshot: false`

Why disabled:

- snapshots can be expensive in very large repositories
- disabling snapshots reduces overhead from internal tracking

Tradeoff:

- you lose OpenCode’s built-in revert/undo snapshot workflow

If you re-enable snapshots, test performance first in the target repository.

## 7. MCP integration

Configured in:

- `opencode.jsonc` → `mcp`

Current MCP servers:

- `context7`
  - remote docs lookup
  - URL: `https://mcp.context7.com/mcp`
- `gh_grep`
  - remote code pattern search
  - URL: `https://mcp.grep.app`

Why these two:

- `context7` is high-value when library docs matter and avoids a lot of guesswork
- `gh_grep` is useful for external implementation examples and cross-repo pattern checks

How to extend:

1. Add another server object under `mcp`.
2. Use `type: "remote"` plus `url`, or `type: "local"` plus `command`.
3. Add `headers`, `oauth`, `environment`, or `timeout` only when actually needed.
4. Re-run `opencode debug config` after changes.

## 8. Persistent memory integration

Configured in:

- `opencode.jsonc` → `plugin`
- optional local file `supermemory.jsonc`

Plugin:

- `opencode-supermemory`

This is intentionally optional at runtime:

- the plugin is installed locally through npm
- its API key is not tracked in git
- the installer asks whether to configure it

If Supermemory is enabled, recommended use flow:

1. Start OpenCode in a repository.
2. Run `/memory-bootstrap`.
3. Save only durable architectural facts or recurring pitfalls.

Avoid storing:

- transient debugging notes
- temporary task plans
- secrets
- noisy experimental output

## 9. LSP design

Configured in:

- `opencode.jsonc` → `lsp`
- wrapper scripts in `bin/`

Current language coverage:

- C/C++ via `clangd`
- Python via `pyright-langserver`
- JavaScript/TypeScript via `typescript-language-server`
- JSON/JSONC via `vscode-json-language-server`

### 9.1 Why wrapper scripts exist

The wrappers in `bin/` solve two common portability problems:

- command names differ across machines
- global binaries may not exist even though local npm dependencies do

Each wrapper resolves in this order:

1. local package binary from `node_modules/.bin`
2. global command if available
3. fail with a targeted error

This means the committed config can point to stable wrapper paths instead of guessing each machine’s binary layout.

### 9.2 Wrapper files

- `bin/clangd-lsp`
- `bin/python-lsp`
- `bin/typescript-lsp`
- `bin/json-lsp`

### 9.3 LSP-specific notes

Python:

- uses `pyright-langserver`
- workspace diagnostics are enabled
- type checking is set to `basic`

TypeScript:

- uses `typescript-language-server`
- non-relative import preference is configured
- completion and parameter hint preferences are enabled

JSON:

- uses `vscode-json-language-server`
- formatter support is enabled
- `file` and `https` schema protocols are allowed

C/C++:

- prefers whichever `clangd` is present
- enables background indexing and clang-tidy

### 9.4 How to add another language

1. Decide whether OpenCode already has a built-in LSP that is sufficient.
2. If you need explicit behavior, add a new entry to `opencode.jsonc` → `lsp`.
3. If the binary resolution is likely to vary across machines, create a wrapper in `bin/`.
4. Add dependency installation to `package.json` only when the server is npm-based.
5. Verify with OpenCode’s LSP debug commands in a repository that actually contains the target file types.

## 10. Instruction architecture

Instruction files live in:

- `instructions/core.md`
- `instructions/large-projects.md`

They are always included through the `instructions` array in `opencode.jsonc`.

Purpose split:

- `core.md`
  stable operating rules and tooling preferences
- `large-projects.md`
  repo-scale heuristics and context management rules

The config also references common project-local rule file patterns:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*.md`
- `.cursor/rules/*.mdc`

This allows repository-specific guidance to layer on top of the global behavior.

If you add more instruction files:

1. Keep each file narrowly scoped.
2. Prefer stable behavioral guidance over task-specific wording.
3. Avoid duplicating the same instruction in multiple files.

## 11. Custom agents

Custom subagents live in:

- `agents/repo-architect.md`
- `agents/review-analyst.md`

These are file-based agent definitions using frontmatter plus prompt body.

### 11.1 `repo-architect`

Use this when:

- a repository is unfamiliar
- the codebase is large
- the task crosses multiple packages or services
- architectural risk needs to be mapped before changes

Expected outputs:

- architecture map
- hotspots
- safe edit strategy
- validation path
- durable memory candidates

### 11.2 `review-analyst`

Use this when:

- a deep review is needed
- a branch or patch must be assessed for risk
- correctness and regression risk matter more than implementation help

Expected outputs:

- findings first
- exact file references
- severity ordering

### 11.3 Inline agent overrides

The built-in agents are also overridden inline in `opencode.jsonc` for:

- `build`
- `plan`
- `explore`
- `summary`
- `title`

Why both file-based and inline agents are used:

- file-based agents are easier to extend and reason about for custom subagents
- inline overrides are simpler for tuning built-in agents without replacing the whole built-in definition model

## 12. Custom commands

Configured in:

- `opencode.jsonc` → `command`

Current commands:

- `map-repo`
- `deep-review`
- `memory-bootstrap`
- `compact-handoff`

These commands are thin orchestration entry points. They do not add runtime logic outside OpenCode. Their job is to:

- standardize repeated workflows
- bind those workflows to the right subagent and model
- make high-value large-project behaviors easy to invoke

If you add new commands:

1. Keep the description short.
2. Make the template specific enough to be reusable.
3. Bind the command to a custom agent only if that agent adds real specialization.
4. Prefer one clear command over multiple overlapping ones.

## 13. Installer behavior

The portable bootstrap is:

- `install.sh`

### 13.1 What it does

1. Copies the repository into the target config directory if needed.
2. Installs `opencode` if missing.
3. Verifies `node` and `npm` exist.
4. Runs `npm install`.
5. Prompts for NanoGPT API key and base URL.
6. Seeds the local VPN provider files if they do not exist.
7. Optionally configures Supermemory.
8. Verifies the resolved configuration with `opencode debug config`.

### 13.2 Local files created by the installer

- `local/nanogpt-api-key`
- `local/nanogpt-base-url`
- `local/local-vpn-api-key`
- `local/local-vpn-base-url`
- optional `supermemory.jsonc`

### 13.3 Why the installer writes files instead of environment variables

File-backed substitution is more stable for this package because:

- OpenCode supports `{file:...}` natively
- files survive shell restarts
- the config can be used from any shell or launcher without re-exporting environment variables

### 13.4 Safe modifications

If you change installer behavior:

1. Keep idempotency.
2. Avoid overwriting user-provided secrets unless explicitly intended.
3. Keep defaults non-sensitive.
4. Re-run the installer locally before pushing.

## 14. Package manifest and dependencies

Managed in:

- `package.json`
- `package-lock.json`

Why npm is used:

- deterministic lockfile
- easy install on most systems
- local binary resolution through `node_modules/.bin`

The package manifest currently exists to support:

- OpenAI-compatible provider runtime package
- installed LSP binaries
- persistent memory plugin

If you add or remove npm dependencies:

1. update `package.json`
2. run `npm install`
3. commit the resulting `package-lock.json`
4. verify wrapper paths still resolve

## 15. Safe change workflow

When changing this package, the safest workflow is:

1. edit tracked config or scripts
2. run `opencode debug config`
3. test provider/model listing if provider changes were made
4. test wrapper scripts if LSP changes were made
5. run the installer if local bootstrap behavior changed
6. verify `git status`
7. commit and push

Recommended verification commands:

- `opencode debug config`
- `opencode models nano-gpt`
- `opencode models local-vpn`
- `opencode agent list`
- `./bin/clangd-lsp --version`
- `./bin/typescript-lsp --help`

Note:

- some LSP binaries return connection errors when run without `--stdio`; that is normal if the binary itself is present and callable

## 16. Common modification recipes

### Add a new hosted provider

1. Add a new provider block under `provider`.
2. Use the correct SDK package.
3. Store secrets in new files under `local/`.
4. Add the provider ID to `enabled_providers` if you want it active.
5. Add explicit model definitions with limits.
6. Update `README.md` and this file.
7. Run verification.

### Add a new model to an existing provider

1. Add the model object under `provider.<id>.models`.
2. Set `id`, `name`, capability flags, modalities, and `limit`.
3. Keep costs if known; otherwise document why they are omitted.
4. Verify the model appears in `opencode models <provider>`.

### Change the default model

1. Update `model`.
2. Optionally update `small_model`.
3. Re-check whether the chosen model supports tool calling.
4. Re-test compaction assumptions.

### Add another LSP

1. Decide whether a wrapper is needed.
2. Add npm dependency if necessary.
3. Add a wrapper in `bin/`.
4. Add the `lsp` config entry.
5. Validate on a repository that has matching files.

### Change the local VPN route

Do not edit `opencode.jsonc` unless the provider structure itself changes.

Instead, edit:

- `local/local-vpn-base-url`

This keeps the tracked config stable and machine-specific routing local.

## 17. Known assumptions

This package currently assumes:

- the local VPN route at `http://localhost:4141/` is OpenAI-compatible
- a placeholder API key is sufficient for the local route
- the route continues to expose a standard OpenAI-style `/v1/models` payload
- npm is available on the machine
- OpenCode 1.3.x-compatible config schema remains in use

If any of those assumptions stop being true, the fix should usually happen in one of:

- `install.sh`
- `opencode.jsonc`
- the wrapper scripts in `bin/`

## 18. Recommended maintenance discipline

To keep this package healthy over time:

- avoid mixing secrets into tracked files
- keep provider model tables curated rather than exhaustive
- prefer local files for per-machine values
- keep command and agent prompts focused and non-overlapping
- document every non-obvious config decision here

When in doubt, update `INFO.md` in the same commit as the implementation change. That is the intended maintenance contract for this repository.
