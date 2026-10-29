# opencode-bridge — Claude Code → opencode delegation (MCP)

Dependency-free stdio MCP server that lets Claude Code act as the "master" and hand
work to `opencode run` workers (default model `opencode-go/muse-spark-1.3-contributor`).

Tools: `opencode_start` (async, returns task id), `opencode_status`, `opencode_result`,
`opencode_cancel`, `opencode_list`. Pass `session: <task id>` to `opencode_start` to continue
that worker's opencode session. Results are plain text (`task <id> started`,
`done (15s, 312 chars)`, `[done]\n<worker output>`), not JSON.

Workers run as a plain inline `worker` agent on a private (`--standalone`) opencode instance (permission `task: deny`), not the default
`orchestrator`, so they do the work themselves instead of delegating to sub-agents and ending their turn early. Override with
`OPENCODE_BRIDGE_AGENT` (e.g. `build`). Your global opencode config is not modified.

Safety: workers are confined to `OPENCODE_BRIDGE_ROOT` (the `cwd` passed to `opencode_start`
must resolve inside it; anything else returns `cwd must be inside <root>`), and a
guard preamble tells them not to run git commit/push/config. Note your opencode config's
`permission: "allow"` still applies to the worker — scope the root tightly.

The server sets `PWD` to the worker's `cwd` when spawning. opencode resolves its project
directory from `$PWD`, not the process cwd, so without this a worker would silently run in
the directory Claude Code was launched from regardless of the `cwd` argument.

## Install
```sh
mkdir -p ~/.claude/mcp/opencode-bridge
cp claude-bridge/server.mjs ~/.claude/mcp/opencode-bridge/
claude mcp add opencode-bridge --scope user \
  -e OPENCODE_BRIDGE_ROOT=$HOME/Documents/Github \
  -- node ~/.claude/mcp/opencode-bridge/server.mjs
```
Restart Claude Code; the tools appear as `mcp__opencode-bridge__*`. Check with
`claude mcp get opencode-bridge` (should show `✔ Connected`).

Choosing the root: `--scope user` registers the bridge for every project, so use one root that
contains all the projects you delegate in (e.g. `~/Documents/Github`), not `$HOME`. For a single
project, use `--scope local` with that project's path instead. If `OPENCODE_BRIDGE_ROOT` is unset
it falls back to the server's cwd (the project dir Claude Code was started in).

Optional env: `OPENCODE_BRIDGE_MODEL` to change the default model, `OPENCODE_BRIDGE_AGENT` to
change the worker agent.

Update: re-copy `server.mjs` and restart Claude Code. Remove: `claude mcp remove opencode-bridge -s user`.

## Verify
Send a task with a `cwd` inside the root and check the file lands there (not in Claude Code's own
cwd), and that a `cwd` outside the root is rejected:
```text
opencode_start {prompt: "Create hello.txt containing ok", cwd: "<root>/scratch"}  → task <id> started
opencode_status {id}                                                              → done (15s, …)
opencode_start {prompt: "x", cwd: "/etc"}                                         → cwd must be inside <root>
```
