# opencode config (v2 branch)

Global opencode configuration for **opencode v2** (`opencode --version` → `v2.0.14`
at time of writing). Lives at `~/.config/opencode/`.

> Branch note: `v2` = opencode v2. `main` / `lite` = legacy v1-shaped config.
> Do not merge v1 branches into `v2` without re-checking the file-vs-runtime
> shape rules below.

## Install on a fresh PC

```bash
# 1. Install opencode v2 and bun (MCP runners)
curl -fsSL https://opencode.ai/install | bash
curl -fsSL https://bun.sh/install | bash   # provides `bunx`

# 2. Get this config
git clone git@github.com:Subhajit-Roy-Partho/opencode-config.git ~/.config/opencode
cd ~/.config/opencode
git checkout v2

# 3. Install plugin dependencies (pinned in package.json + lockfiles,
#    tracked on the v2 branch so a fresh PC reproduces this exact install)
npm ci
# Expected: @opencode-ai/plugin, oh-my-opencode-slim, opencode-supermemory.

# 4. Log in to providers (Zen / Go / Copilot are now built in — no plugin needed)
opencode auth login        # pick your providers interactively
opencode auth list          # verify

# 5. Composio (optional, currently 401 until you log in)
#    Complete the Composio login in a browser, then restart opencode.

# 6. Verify zero-error startup
opencode plugin list       # every row must have an ID, no "-" entries
opencode debug config      # stderr must be empty
```

## v2 file shape (read before editing `opencode.jsonc`)

opencode v2 normalizes config at load: the **file** uses one shape, `opencode
debug config` prints the **resolved runtime** shape. They differ — do not
"fix" the file to look like the debug output. Verified against the live
schema (`https://opencode.ai/config.json`, which IS the v2 schema; there is
no `/v2/config.json` — that URL 404s) and against `v2.0.14` loader behavior:

| File key (write this) | Resolved as (debug output) | Notes |
|---|---|---|
| `plugin[]` | `plugins[]` | Singular in file. |
| `agent{}.prompt` / `agent{}.permission` | `agents{}.system` / `agents{}.permissions[]` | Singular in file. |
| `provider{}.npm` / `provider{}.options` | `providers{}.package` / `providers{}.settings` | `package`/`settings` are **rejected** in the file (schema `additionalProperties: false`). The normalizer rewrites `npm: "@ai-sdk/openai-compatible"` → `package: "aisdk:@ai-sdk/openai-compatible"`. |
| `command{}.template` | `commands{}.template` | `template` stays, still required. |
| `permission: "allow"` | `permissions: [{action:"*",…}]` | String form is schema-valid, keep. |
| `mcp` flat map, `enabled: true` | `mcp.servers`, `disabled: false` | No `.servers` wrapper in file, no `disabled` key. Local servers: `{type:"local", command:[...], enabled:true}`. |
| `compaction: {auto}` | same + `buffer` default | `prune`/`reserved` dropped (v2 branch decision). |
| no `lsp` block | — | Dropped on v2 branch (was pyright + clangd). Re-add if v2 honors it again. |
| `$schema: https://opencode.ai/config.json` | — | Canonical v2 schema URL. |

Local plugin modules must `export default { id, setup }` (both keys required;
`server` alone is ignored). The v1 shapes — bare default function, named
`export const X` — fail with `PluginModule.LoadError` (visible in
`~/.local/share/opencode/log/opencode.log`, NOT in `plugin list`). `setup` is
`async (ctx) => disposer` and registers hooks imperatively:
`ctx.tool.hook("execute.before"/"execute.after", …)`,
`ctx.session.hook("compaction"/"prompt"/"context"/"model.request", …)`,
`ctx.event.subscribe()` (v2 events: `session.execution.started/succeeded/failed`,
`session.created`, …). See `plugins/*.js` and oh-my-opencode-slim's
`createV2Setup` for the reference implementation.

## Environment variables (terminal-settable)

Only vars verified below are documented; anything else is marked unverified.

| Variable | Verified | Purpose |
|---|---|---|
| `SUPERMEMORY_API_KEY` | Yes — referenced in `opencode-supermemory` dist | Enables the Supermemory memory backend. Without it the bridge loads but stays inert. |
| `SUPERMEMORY_BASE_URL` / `SUPERMEMORY_DEBUG` / `SUPERMEMORY_PROJECT_TAG` / `SUPERMEMORY_REPO_TAG` / `SUPERMEMORY_ISOLATE_WORKTREES` | Yes — same source | Optional Supermemory tuning. |
| `OH_MY_OPENCODE_SLIM_DISABLE` | Yes — referenced in slim dist | Set to disable the slim orchestrator without uninstalling. |
| `OH_MY_OPENCODE_SLIM_PRESET` | Yes — same source | Slim preset selection. |
| `OPENCODE_CONFIG_DIR` / `OPENCODE_LOG_DIR` / `OPENCODE_TUI_CONFIG` | Yes — referenced in slim dist (consumed by opencode host) | Override config dir, log dir, TUI config path. |
| NanoGPT API key for the `nano-gpt` provider | **Unverified** — no key is stored in this repo; set whatever `https://nano-gpt.com` docs say (no `apiKey` in `provider.options` by design) | Authenticates the custom NanoGPT provider. |
| Composio credentials | **Unverified** — remote MCP, browser login required (currently 401) | Authenticates the Composio MCP server. |
| `LIBKEY_ID` / `LIBKEY_KEY` (`LIBKEY_API_KEY` alias) | `LIBKEY_ID` defaults to **158 (ASU, verified)**; `LIBKEY_KEY` unset — request at https://thirdiron.com/api-request; script falls back to keyless WAYFless links until set | ASU API key for `libkey/libkey_lookup.sh`. |

No API keys are stored in this repo. `service.json` (if present) is local-only
and must never be committed.

## Plugins

| Plugin | Decision | Reason |
|---|---|---|
| `oh-my-opencode-slim` | KEEP (npm) | v2-native (`{id, server, setup}`), lane agents, zero load errors. |
| `opencode-supermemory` | KEEP via `plugins/supermemory-bridge.js` | Upstream v2.0.13 exports only named `SupermemoryPlugin` (no default) so it cannot load directly; the local bridge re-exports it as `{id, setup}` and forwards `event` + `tool.execute.before/after`. `chat.message`, custom `tool` and v1 compaction hooks have no local v2 equivalent and are skipped (logged). Delete the bridge and restore the bare npm entry once upstream ships a default export. |
| `plugins/env-protection.js` | KEEP (local, ported) | Blocks `.env` reads (allows `.env.example`). |
| `plugins/memory-compaction.js` | KEEP (local, ported) | Injects persistent-memory guidance via v2 `compaction` session hook (v1 `context.push` has no v2 equivalent; guidance is appended to the compacted messages instead, fail-open). |
| `plugins/notification.js` | KEEP (local, ported — absorbs `opencode-notify`) | Native desktop notify on session idle/error via `notify-send`/`osascript`. |
| `plugins/shell-strategy.js` | KEEP (local, ported) | Rejects interactive shell commands (`vim`, `ssh`, …). Covers v2 tool names `bash` + `execute`. |
| `plugins/todo-tracker.js` | KEEP (local, ported) | Logs session start (console in v2 `setup`; `client.app.log` retained in the v1 `server` fn). |
| `opencode-pty` | REMOVED | Dead; pruned from `plugin[]`, uninstalled. |
| `opencode-copilot-plugin` | REMOVED | Copilot is built in via `opencode auth login`; plugin redundant + v1-shaped (was LoadErroring). |
| `opencode-queue` | REMOVED | Dead; was LoadErroring (missing from install + v1 shape). |
| `opencode-snip` | REMOVED | Dead; was LoadErroring. |
| `opencode-notify` | REMOVED (replaced) | Replaced by local `plugins/notification.js`; uninstalled. |
| `opencode-mem` | REMOVED (was already out of `plugin[]`) | `usearch` native module crashes Bun on shutdown; uninstalled. |
| `flowdeck` | REMOVED | Was in `package.json` but referenced nowhere; uninstalled. |

`@opencode-ai/plugin` stays in `package.json` for plugin type-checking only
(local plugins use JSDoc `@type {import("@opencode-ai/plugin").Plugin}`).

## Prompt queue (`/queue`)

Normal prompts steer immediately (untouched). `/queue <text>` holds text in
`~/.config/opencode/.queue.md` and releases it only after background work
finishes.

| Command | Action |
|---|---|
| `/queue <text>` | Append `<text>` + UTC timestamp; replies with position in queue. |
| `/queue-status` | List pending entries (oldest first). Never executes them. |
| `/queue-run` | Manually drain now, oldest first. |
| `/queue-clear` | Drop all pending entries without running them. |

Drain is approximated, not exact: opencode has no native `task.completed`
hook, so `plugins/queue-drain.js` debounces `session.idle` by 2s, re-checks
the session status map (no busy/retry self or children), then pops the
oldest entry via `client.session.prompt`, looping until the queue is empty
or something goes busy. If the approximation misses, `/queue-run` is the
manual escape hatch. `.queue.md` is local-only and git-ignored.

## MCP servers (`mcp`, flat map in file)

| Server | Type | Command | Auth |
|---|---|---|---|
| `composio` | remote | `https://connect.composio.dev/mcp` | Required — browser login (401 until completed, handled by user). |
| `arxiv` | local (keyless) | `bunx @cyanheads/arxiv-mcp-server` | None. Fetched on first use. |
| `openalex` | local (keyless) | `bunx @cyanheads/openalex-mcp-server` | None. Fetched on first use. |
| `context7` | local (keyless) | `npx -y @upstash/context7-mcp` | None. Fetched on first use. |
| `firecrawl-mcp` | local (no-auth) | `npx -y firecrawl-mcp@3.23.7`, `FIRECRAWL_API_URL=http://localhost:3002` | None — self-hosted stack in `../firecrawl` (docker). `timeout: 30000` (cold starts are slow; the 5s default false-negatives). Docs-first: the API may not be up yet. |

Tool fallback (no repo `AGENTS.md`, so the rule lives here): try
`firecrawl-mcp_*` tools first; on connection/timeout failure fall back to
built-in `webfetch`/`websearch`; never treat the fallback as an error.

## LibKey lookup (`libkey/`, keyless-safe)

- Script: `libkey/libkey_lookup.sh --doi <DOI>` or `--pmid <PMID>`
  (bash + curl + jq; `chmod +x` already set). Prints title, bestLink,
  recommendedLinkText, openAccess, retraction / expression-of-concern flags,
  and browzineWebLink on success.
- Credentials (terminal-settable, never committed): `LIBKEY_ID` defaults to
  **158 = ASU** (verified: ASU's libguide links `browzine.com/libraries/158`
  as "BrowZine at ASU Library", and the rendered
  `libkey.io/libraries/158/<doi>` page reads "Access Provided By Arizona
  State University Library"). Only `LIBKEY_KEY` (alias `LIBKEY_API_KEY`) is
  still TODO — request the API key at https://thirdiron.com/api-request;
  the script runs in keyless WAYFless mode until it arrives.
- Without the key, or on any HTTP error, the script prints the keyless WAYFless
  fallback `https://libkey.io/libraries/158/<doi-or-pmid>`
  plus a one-line note — never an error.
- Disk-fetch policy: save article PDFs to disk only when LibKey reports
  `openAccess: true`; otherwise link, don't fetch.
- TODO (custom-tool wiring): this repo has no custom-tool pattern yet (no
  `tools/` or `.opencode/tools/` convention), so the script is currently
  invoked via `bash`/`execute`. Wire it as a native OpenCode custom tool once
  a repo convention is chosen — do not invent a one-off pattern.

## Preserved model choices (do not change casually)

- Top default: `opencode/big-pickle` (free stealth model on opencode Zen).
- Lane agents `code-reviewer, architect, test-writer, debugger, explorer, fixer,
  librarian, oracle, designer` → `opencode-go/muse-spark-1.3-contributor`.
- `vision` → `opencode/muse-spark-1.3-contributor-free` (explicit choice).
- `nano-gpt` custom provider + full model table (NanoGPT, OpenAI-compatible).

## Files

- `opencode.jsonc` — main config (tracked).
- `plugins/*.js` — local v2 plugins (tracked).
- `libkey/libkey_lookup.sh` — LibKey article lookup with WAYFless fallback (tracked, executable).
- `cli.json` — v2 TUI config (`$schema: …/v2/cli.json`; untracked, machine-local).
- `tui.json` — legacy TUI config (tracked, left for v1 branches).
- `package.json` / `package-lock.json` / `bun.lock` — **tracked on the v2
  branch** (force-added over the repo `.gitignore`, which still ignores them on
  v1 branches); fresh PCs reproduce the exact install with `npm ci`.
- `service.json`, `*.bak`, `.oh-my-opencode-slim/`, `node_modules/` — never commit.
