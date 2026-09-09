# opencode-config

Shared [opencode](https://opencode.ai) configuration: curated plugins, subagents,
skills, slash commands and hardened defaults. Deploys to `~/.config/opencode`.

Works on **macOS and Linux**, **amd64 (x86_64) and arm64** — everything in this
repo is arch-independent (JS plugins, Markdown agents/skills, JSONC config). No
binaries are committed; `install.sh` fetches the correct opencode build per
platform, and optional native extras (`snip`) have per-arch install commands.

## What's inside

| Path | What |
|---|---|
| `opencode.jsonc` | Model, watcher ignores, LSP disables, agents, slash commands, plugin list, NanoGPT provider |
| `tui.json` | Theme, scroll and mouse defaults |
| `opencode-mem.jsonc` | Seed for `opencode-mem` (auto-capture **off** until you add a backend — no placeholder-key errors) |
| `acp.jsonc` | Seed for `opencode-acp` (context pruning) |
| `plugins/onnx-fix.js` | Caps ONNX/BLAS threads (`OPENCODE_CORES`, default min(cpus,4)) — loads first |
| `plugins/env-protection.js` | Blocks `read`/`edit`/`write` of `.env*`, `*.pem`, `*.key` |
| `plugins/memory-compaction.js` | Injects persistent-memory checklist on session compaction |
| `plugins/notification.js` | Desktop ping on `session.idle` / `session.error` (macOS + `notify-send`, sanitized) |
| `plugins/shell-strategy.js` | Rejects interactive shell commands (`vim`, `ssh`, …) |
| `agents/*.md` | `architect`, `reviewer` (`code-reviewer`), `test-engineer` (`test-writer`), `debugger` subagents |
| `skills/*` | `memory` (cross-session context), `step-by-step` (structured multi-file work) |
| `package.json` | Pinned plugin versions (verified 2026-09-09, see below) |
| `install.sh` | Cross-platform installer (backup + merge, never clobbers your provider/model) |

> **Removed 2026-09-09: `opencode-forgecode`** (was in the plugin list). It hung
> every session (`opencode run` / TUI never started) because its
> `better-sqlite3` native binding is missing from opencode's plugin cache and no
> prebuild is shipped (`oc-forgecode doctor` → `[FAIL] Database: Could not
> locate the bindings file`). Bisected: all remaining plugins return instantly.
> Its roles are covered by `oh-my-opencode-slim` (orchestration),
> `opencode-acp` (context pruning) and `opencode-mem` (memory). To re-add it
> later: `npm i opencode-forgecode`, confirm `oc-forgecode doctor` shows
> `[OK] Database`, then re-add it to `plugin` in `opencode.jsonc`.

### Plugin versions (verified 2026-09-09 via `npm view`, all latest)

`oh-my-opencode-slim` 2.2.18 · `opencode-mem` 2.26.0 · `opencode-acp` 1.16.0 ·
`opencode-supermemory` 2.0.13 · `opencode-working-memory` 1.6.9 ·
`opencode-pty` 0.3.6 · `opencode-copilot-plugin` 0.6.4 · `opencode-notify` 0.3.1 ·
`opencode-snip` 1.6.1 · `@opencode-ai/plugin` 1.18.30 (matches opencode 1.18.30)

> `opencode-snip` disables itself gracefully when the `snip` binary is missing —
> install it to activate (see below). Nothing else requires native binaries.

## Install

```bash
git clone https://github.com/Subhajit-Roy-Partho/opencode-config
cd opencode-config
./install.sh
```

The installer backs up `~/.config/opencode` first, keeps your existing
provider/model/theme, and only seeds plugin-managed files (`opencode-mem.jsonc`,
`acp.jsonc`) when absent.

Optional native extras:

```bash
# snip — token-saving shell proxy (macOS arm64/amd64, Linux amd64/arm64)
brew install edouard-claude/tap/snip              # macOS
go install github.com/edouard-claude/snip/cmd/snip@latest  # any arch with Go
```

Verify the full GUI starts cleanly:

```bash
opencode debug startup
opencode serve --port 18751 --hostname 127.0.0.1
curl http://127.0.0.1:18751/global/health   # {"healthy":true,...}
# or: opencode web   (opens the web interface)
```

Enable memory auto-capture (optional): edit `~/.config/opencode/opencode-mem.jsonc` —
either set `opencodeProvider`/`opencodeModel` to a provider from
`opencode providers list` (uses opencode's own auth, no key needed), or set
`memoryModel` + `memoryApiUrl` + `memoryApiKey` (`env://VAR` supported), then set
`autoCaptureEnabled: true`. Tune embedding threads with `OPENCODE_CORES=N`.

## Fixes applied (2026-09-09 audit)

Verified against opencode **1.18.30** on arm64, plus `npm view` + docs for the rest.
`opencode serve` health-checks return HTTP 200 with the full plugin set.

- **Broken `vision` agent** — model `opencode-go/kimi-k2.6` referenced a provider
  that doesn't exist. Now uses `{env:OPENCODE_MODEL}` like the other agents.
- **Broken `/plan` command** — pointed at a nonexistent `plan` agent. Now routes
  to the real `architect` agent.
- **Wrong LSP key** — `haskell-language-server` is not a valid server name
  ([docs](https://opencode.ai/docs/lsp/)); corrected to `hls`.
- **Removed `plugins/todo-tracker.js`** — logged one line on session start, no
  actual tracking; dead weight in every session.
- **Removed `fix-oh-my-opencode-slim.js`** — patched upstream issue
  [alvinunreal/oh-my-opencode-slim#310](https://github.com/alvinunreal/oh-my-opencode-slim/issues/310);
  verified fixed in 2.2.18 (`Array.isArray` guard present in dist). The script is
  now a permanent no-op, so it was deleted.
- **`opencode-mem.jsonc` safe default** — shipped `autoCaptureEnabled: true` with
  placeholder key `sk-...`, which errors on every fresh clone. Default is now
  `false` with key via `env://OPENAI_API_KEY` and enable instructions.
- **Hardened local plugins** — `notification.js` sanitizes text (was shell-quote
  injectable) and skips cleanly without `notify-send`; `env-protection.js` now
  guards `edit`/`write` (not just `read`) plus `*.pem`/`*.key`, with null-guards;
  `shell-strategy.js` guards missing/non-string commands; `onnx-fix.js` picks
  `min(cpus,4)` with `OPENCODE_CORES` override instead of hardcoded 1.
- **`tui.json` sidebar** — dropped the `opencode-forgecode` TUI widget along
  with the plugin (see removal note above).
- **`.gitignore` tracked deps** — was ignoring `package.json`/`package-lock.json`;
  now tracked via added `package.json` so installs are reproducible.
- **Fixed total startup hang (TUI wouldn't open)** — root-caused to
  `opencode-forgecode` (see removal note): every `run`/TUI session hung during
  plugin init. After removal, `opencode run`, `opencode models`,
  `opencode debug config` and `opencode serve`/`web` all respond normally.
