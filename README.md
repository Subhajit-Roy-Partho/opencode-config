# OpenCode Config

Portable `opencode` setup tuned for large repositories and long-running sessions.

## What is included

- NanoGPT as the only enabled provider, with explicit model metadata and limits
- Large-project defaults for compaction, watcher noise reduction, and snapshot cost control
- Built-in remote MCP integrations for Context7 docs lookup and Grep code search
- Optional persistent memory through `opencode-supermemory`
- Explicit LSP wiring for C/C++, Python, JavaScript, TypeScript, and JSON/JSONC
- Custom large-project instructions, commands, agents, and a custom TUI theme

## Install on a new machine

```bash
git clone git@github.com:Subhajit-Roy-Partho/opencode-config.git ~/.config/opencode
cd ~/.config/opencode
./install.sh
```

The installer will:

- install `opencode` if it is missing
- install the local npm dependencies used by the provider and LSP wrappers
- prompt for NanoGPT API key and base URL
- optionally configure Supermemory
- verify the resolved config with `opencode debug config`

## Local secrets

Secrets are intentionally kept out of git.

- NanoGPT key: `~/.config/opencode/local/nanogpt-api-key`
- NanoGPT base URL: `~/.config/opencode/local/nanogpt-base-url`
- Optional Supermemory config: `~/.config/opencode/supermemory.jsonc`

## Recommended first steps

- Run `/memory-bootstrap` in a new repository after enabling Supermemory.
- Use `/map-repo` before deep refactors in unfamiliar monorepos.
- Use `/deep-review path/or/branch` for high-signal review passes.
