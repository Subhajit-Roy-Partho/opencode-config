# opencode-bridge — Claude Code → opencode delegation (MCP)

Dependency-free stdio MCP server that lets Claude Code act as the "master" and hand
work to `opencode run` workers (default model `opencode-go/muse-spark-1.3-contributor`).

Tools: `opencode_start` (async, returns task id), `opencode_status`, `opencode_result`,
`opencode_cancel`, `opencode_list`. Pass `session: <task id>` to `opencode_start` to continue
that worker's opencode session.

Workers run as a plain inline `worker` agent on a private (`--standalone`) opencode instance (permission `task: deny`), not the default
`orchestrator`, so they do the work themselves instead of delegating to sub-agents and ending their turn early. Override with
`OPENCODE_BRIDGE_AGENT` (e.g. `build`). Your global opencode config is not modified.

Safety: workers are confined to `OPENCODE_BRIDGE_ROOT` (cwd must resolve inside it), and a
guard preamble tells them not to run git commit/push/config. Note your opencode config's
`permission: "allow"` still applies to the worker — scope the root tightly.

## Install
```sh
mkdir -p ~/.claude/mcp/opencode-bridge && cp server.mjs ~/.claude/mcp/opencode-bridge/
claude mcp add opencode-bridge --scope local \
  -e OPENCODE_BRIDGE_ROOT=/path/to/project \
  -- node ~/.claude/mcp/opencode-bridge/server.mjs
```
Restart Claude Code; the tools appear as `mcp__opencode-bridge__*`.
Optional env: `OPENCODE_BRIDGE_MODEL` to change the default model.
