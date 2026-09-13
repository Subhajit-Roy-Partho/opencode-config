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
| `opencode.jsonc` | Model, watcher ignores, LSP disables, agents (incl. `afm` chat + `afm-run` runner + `afm-agent` via tool-voice-proxy), slash commands (incl. `/weather` + `/search`), local weather MCP wiring, plugin list, NanoGPT + Apple (tool-voice-proxy → fm-proxy) providers |
| `mcp-weather/weather.js` | Zero-dependency stdio MCP server: `get_temperature(city)` via wttr.in (synced to `~/.config/opencode/mcp-weather/` by `install.sh`) |
| `tool-voice-proxy/` | Zero-dependency Node bridge (port `:1981` → `:1977`): translates the AFM model's narrated `{"tool_call":[...]}` JSON into real OpenAI `tool_calls` (synced to `~/.config/opencode/tool-voice-proxy/` by `install.sh`; see its README for the daemon command + repair pipeline) |
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

## Session additions (2026-09-13)

- **`afm` general-assistant agent** (`agent.afm` in `opencode.jsonc`, model
  `apple/system`, `mode: primary`) — everyday Q&A, not just coding. Lean toolset
  (`webfetch` + `bash`, everything else off) to fit AFM's 4k context window.
  Its prompt routes weather lookups through `https://wttr.in/<City>?format=j1`.
- **Apple provider via fm-proxy** (`provider.apple`, baseURL
  `http://127.0.0.1:1977/v1`, `tool_call: false`, 4096/2048 limits). Dependency:
  the proxy itself lives in the sibling repo `Documents/Github/fm-proxy` and
  must be running as a daemon for `apple/system` to resolve.
- **Default model** is now `opencode/muse-spark-1.3-contributor-free` (was
  `opencode/big-pickle`). Requires `opencode auth login` for Zen auth.
- **Orchestrator guard** — `agent.orchestrator.permission.copilot_prompt: deny`.

## Session additions (2026-09-13, update 2: `afm` split into chat + runner)

- **`afm` reverted to zero tools** (`tools: {"*": false}`) with an honest
  tool-free general-chat prompt — everyday Q&A answered from knowledge.
- **New sibling `afm-run`** (model `apple/system`, bash-only tools,
  **deliberately no custom prompt**) — the reliable shell runner.
- **Why:** experiments proved ANY custom agent prompt breaks real tool
  execution on `apple/system` — the model prints code fences instead of
  emitting `tool_calls`. The custom prompt replaces opencode's default system
  prompt (which carries the tool-use protocol) and the weak on-device model
  can't recover it. Bash-only with no custom prompt executes reliably
  (verified: `EXECMARKER-123` appears in both the tool-result event and the
  reply via fm-proxy `:1977`).
- **Caveats:** model prose summaries of tool output are loose (trust the
  tool-result event, not the prose); `tool_choice: auto` never yields
  `tool_calls` upstream; full toolsets overflow the 4096-token window.
- **CORRECTION (see update 3 below):** the "executes reliably" claim above was
  premature — follow-up honest self-tests showed `afm-run` on `apple/system`
  only executed ~1 in 8 attempts. AFM stays chat-only.
## Session additions (2026-09-13, update 3: weather MCP + `/weather` + `/search`)

- **New file `mcp-weather/weather.js`** — zero-dependency stdio MCP server
  with one tool, `get_temperature(city)`, backed by wttr.in. Kept to one tool
  with one string param so the schema survives fm-serve. `install.sh` now
syncs `mcp-weather/` into `~/.config/opencode/` alongside
  `plugins/ agents/ skills/`. NOTE: the `mcp.weather` command path in
  `opencode.jsonc` is this machine's absolute path
  (`/Users/subhajitrouy/.config/opencode/mcp-weather/weather.js`) — adjust it
  on other machines.
- **`mcp.weather` block** — local MCP wiring for the above
  (`type: local`, `command: ["node", "<path>/weather.js"]`, `enabled: true`).
- **`command.weather` (`/weather <city>`)** — exact-command curl against
  wttr.in, report verbatim. **`command.search` (`/search <query>`)** —
  DuckDuckGo Lite + python tag-strip, then summarize. Both deliberately NOT
  agent-pinned; both require a tool-capable model.
- **`afm-run` tools** gained `weather_*` alongside `bash`.
- **Honest self-test findings** (all verified by direct `opencode run`, not
  relayed): on `apple/system` the model narrates instead of executing — even
  exact-phrasing and explicit MCP naming failed (only ~1 echo in 8 attempts
  executed). So AFM stays chat-only and these features target capable models.
  On `asu/muse-glimmer-30b` all three paths VERIFIED working: exact-command
  weather → real 86°F Tempe execution, natural question →
  `weather_get_temperature` MCP call → 86°F, DDG search → real results with
  summary. This corrects update 2's premature `afm-run` "executes reliably"
  claim.

## Session additions (2026-09-13, update 4: `afm` anti-fabrication sentence)

- **`agent.afm.prompt` gained one sentence:** "Never invent tool output,
  numbers, JSON, or city data — if you did not retrieve it, say plainly it is
  unavailable instead of guessing."
- **Why:** the user showed `afm` answering a Tempe weather prompt with a
  mangled command (`| head -1` tacked on) plus fabricated JSON
  (`{"location":"New York",...}`) for a Tempe query. Root cause: the ~3B
  on-device model was never trained to emit OpenAI-style function calls, so
  under uncertainty it narrates or confabulates — no config can teach the
  missing training. This tweak doesn't enable execution; it converts lying
  into honest refusal.
- **Self-test** (direct `opencode run --agent afm "What is the temperature in
  Tempe right now?"`): "I cannot provide real-time weather data… This
  information is unavailable at the moment." — no fabrication. Live-data path
  remains `/weather`, `/search`, and the weather MCP tool on tool-capable
  models (asu/Zen), all previously verified.

## Session additions (2026-09-13, update 5: tool-voice-proxy + `afm-agent`)

- **NEW `tool-voice-proxy/`** — zero-dependency Node bridge, port `:1981` →
  `:1977` (fm-proxy). Injects a compact text-envelope protocol per turn and
  translates the model's narrated `{"tool_call":[...]}` JSON into **real
  OpenAI `tool_calls`** so opencode executes them. Includes an 8-step repair
  pipeline (`repairStart`) for the weak model's sloppy JSON, with a tolerance
  table: native array, `tool_calls` array, fenced JSON, `{"tool":…}`,
  object-string form, sibling-key forms, bare-token repairs. Daemon:
  `nohup node tool-voice-proxy.js >/tmp/tool-voice.log 2>&1 &` (PID on
  record; full contract in `tool-voice-proxy/README.md`).
- **`apple` provider now points at `:1981`** (`baseURL
  http://127.0.0.1:1981/v1`); **`tool_call: false` REMOVED** from
  `models.system` — it strips tools from every request, defeating the whole
  point of offering tools so the model can emit an envelope.
- **NEW `afm-agent`** (no prompt key, `tools: {"*": false, bash, webfetch,
  weather_get_temperature}`) — the tool-voice-proxy consumer. `afm` / `afm-run`
  untouched.
- **Battery round-1 (self-tested via `opencode run --agent afm-agent`):**
  weather auto-call **4/4 PASS** (real 86°F Tempe via the MCP weather tool, no
  `/weather` needed — THE headline requirement); EXECMARKER bash side-effect
  **3/5** (real file created on hits); file listing **0/3**; `2+2` **0/3**
  (wrong tool choice + broken JSON). Iteration round 2 in progress — injection
  v2 + repair extension targeting `ls`/math.

## Session additions (2026-09-13, update 6: FULL-FUNCTIONAL RESULT — tool-voice-proxy)

- **tool-voice-proxy (:1981 → fm-proxy :1977 → fm serve :1976) turns the on-device
  3B Apple model into a functional agentic driver in opencode.** Mechanism:
  per-request text-envelope protocol injection; the model's narrated
  `{"tool_call":[{"name","arguments"}]}` JSON — including sloppy variants (bare
  tokens, unquoted DSL args, trailing commas, missing closing bracket) — repaired
  by a 9-step pipeline (incl. string-aware truncated-JSON completion) and re-emitted
  as REAL OpenAI `tool_calls` so opencode executes them; STRIP-on-invalid keeps raw
  JSON out of replies; per-request user-message directives substitute the concrete
  real command for directory-intent and run-command intents (the lever that fixed
  `ls`).
- **FINAL SELF-TESTED BATTERY** (`opencode run --agent afm-agent`): T1 "What is the
  temperature in Tempe right now?" **4/4** — real `weather_get_temperature` call,
  live ~86°F/44% data, NO `/weather` command needed; T2 "List the files in <dir>"
  **3/3** (3 phrasings incl. "current directory") — real `ls`, EXACT real filenames,
  zero fabrication; T3 "Use bash to run: echo EXECMARKER-777 > <file>" **2/2** —
  side-effect file proof; T4 "2 + 2" **3/3** — clean text, zero spurious calls.
- **Hit-rate:** 4 envelope=hit / 0 invalid / no false positives. All three
  emails/rounds iterations recorded (round-1: weather-only pass; round-2: `ls`
  failed; round-3: user-directive lever). Daemon restart command in
  `tool-voice-proxy/README.md`.

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
