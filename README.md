# OpenCode Config

Portable `opencode` setup tuned for large repositories and long-running sessions.

## What is included

- NanoGPT plus a local VPN-routed `gpt-5-mini` provider, both with explicit model metadata and limits
- Large-project defaults for compaction, watcher noise reduction, and snapshot cost control
- Built-in remote MCP integrations for Context7 docs lookup and Grep code search
- Optional persistent memory through `opencode-supermemory`
- Explicit LSP wiring for C/C++, Python, JavaScript, TypeScript, and JSON/JSONC
- Custom large-project instructions, commands, agents, and a custom TUI theme
- A detailed engineering guide in `INFO.md` for future modifications

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
- seed the local VPN-routed `gpt-5-mini` provider with its default route and placeholder key
- optionally configure Supermemory
- verify the resolved config with `opencode debug config`

## Local secrets

Secrets are intentionally kept out of git.

- NanoGPT key: `~/.config/opencode/local/nanogpt-api-key`
- NanoGPT base URL: `~/.config/opencode/local/nanogpt-base-url`
- Local VPN route URL: `~/.config/opencode/local/local-vpn-base-url`
- Local VPN placeholder key: `~/.config/opencode/local/local-vpn-api-key`
- Optional Supermemory config: `~/.config/opencode/supermemory.jsonc`

The installer currently seeds the local VPN provider with:

- URL: `http://localhost:4141/`
- API key: a non-sensitive placeholder value

Change those local files if your VPN route or local proxy changes.

## Providers and models

Default models:

- Main model: `nano-gpt/zai-org/glm-5:thinking`
- Small model: `nano-gpt/google/gemini-3-flash-preview`

Available curated NanoGPT models include:

- `nano-gpt/zai-org/glm-5`
- `nano-gpt/zai-org/glm-5:thinking`
- `nano-gpt/moonshotai/kimi-k2.5`
- `nano-gpt/moonshotai/kimi-k2.5:thinking`
- `nano-gpt/deepseek/deepseek-v3.2-speciale`
- `nano-gpt/deepseek/deepseek-v3.2`
- `nano-gpt/deepseek/deepseek-v3.2:thinking`
- `nano-gpt/openai/gpt-5.2`
- `nano-gpt/openai/gpt-5.2-codex`
- `nano-gpt/google/gemini-3-flash-preview`

Local VPN-routed model:

- `local-vpn/gpt-5-mini`

Switch models inside OpenCode with `/model`, or by editing `model` in `opencode.jsonc`.

## Key files

- `opencode.jsonc`: runtime config, providers, agents, MCP, LSP, and commands
- `tui.jsonc`: TUI-only settings
- `themes/nano-forge.json`: custom theme
- `instructions/*.md`: always-loaded operating rules
- `agents/*.md`: reusable specialized subagents
- `bin/*`: local wrappers that make LSP resolution predictable across machines
- `install.sh`: portable installer and local secret bootstrap
- `INFO.md`: engineering guide for extending or reworking this package

## Recommended first steps

- Run `/memory-bootstrap` in a new repository after enabling Supermemory.
- Use `/map-repo` before deep refactors in unfamiliar monorepos.
- Use `/deep-review path/or/branch` for high-signal review passes.
- Read `INFO.md` before changing provider definitions, installer behavior, agents, or LSP wiring.
