# OpenCode Config

Portable `opencode` setup tuned for large repositories and long-running sessions.

## What is included

- NanoGPT plus a local VPN-routed provider, with OpenCode Zen re-enabled as a built-in provider option
- Large-project defaults for compaction, watcher noise reduction, and snapshot cost control
- Built-in remote MCP integrations for Context7 docs lookup and Grep code search
- Optional persistent memory through `opencode-supermemory`
- Explicit LSP wiring for C/C++, Python, JavaScript, TypeScript, and JSON/JSONC
- Custom large-project instructions, commands, agents, and a custom TUI theme
- A detailed engineering guide in `INFO.md` for future modifications
- Rootless `gh` (GitHub CLI) bootstrap baked into the installer

## Install on a new machine

Prerequisites: `curl`, `git`, `rsync`, `node >= 20` + `npm` (recommended via `nvm`).

```bash
git clone git@github.com:Subhajit-Roy-Partho/opencode-config.git ~/.config/opencode
cd ~/.config/opencode
./install.sh
```

Non-interactive / automation-friendly:

```bash
# All prompts skipped; placeholder NanoGPT key seeded (replace later) if NANOGPT_API_KEY not set
./install.sh --non-interactive

# Or fully seeded via env vars
NANOGPT_API_KEY='sk-...' NANOGPT_BASE_URL='https://nano-gpt.com/api/v1' ./install.sh --non-interactive

# With Supermemory
SUPERMEMORY_API_KEY='sm-...' ./install.sh --non-interactive
# or combine:   NANOGPT_API_KEY='sk-...' SUPERMEMORY_API_KEY='sm-...' ./install.sh --yes
```

One-liner (curl + env):

```bash
curl -fsSL https://raw.githubusercontent.com/Subhajit-Roy-Partho/opencode-config/modern/install.sh | bash -s -- --non-interactive
# then drop in the real key:
echo 'sk-...' > ~/.config/opencode/local/nanogpt-api-key && chmod 600 ~/.config/opencode/local/nanogpt-api-key
```

The installer will:

- install `gh` (GitHub CLI) without root to `~/.local/bin/gh` if missing
- install `opencode` if missing (`https://opencode.ai/install`)
- validate `node >= 20` (with NVM auto-switch and actionable fix hints)
- install local npm dependencies (`@ai-sdk/openai-compatible`, LSP servers, etc.)
- prompt for NanoGPT API key and base URL (or use `NANOGPT_API_KEY` / `NANOGPT_BASE_URL` / `--non-interactive` placeholder)
- seed the local VPN provider with its default route and placeholder key
- optionally configure Supermemory (or use `SUPERMEMORY_API_KEY` / skip in non-interactive)
- verify with `opencode debug config` + `opencode debug startup` timing check (< 3 s expected)

If `opencode` does not open quickly, run `opencode debug startup` and `opencode debug config` — common causes
are a bloated plugin list, missing `local/*` file refs, or an old `node` on `PATH` (see Common pitfalls).

Reinstall / update on the same host:

```bash
cd ~/.config/opencode
git pull --ff-only
./install.sh            # reuses existing local secrets by default
```

## GitHub CLI (gh) — installed without root

`install.sh` installs `gh` automatically (no `sudo`), fetches the latest Linux `amd64` tarball from
`cli/cli` releases, extracts `gh` to `~/.local/bin/gh`, and registers its man page. `~/.local/bin`
is already on `PATH` via `~/.bash_profile` on this host; verify with `which gh && gh --version`.

Authenticate after install:

```bash
gh auth login            # interactive (SSH or HTTPS)
# or headless/CI:
echo "$GH_TOKEN" | gh auth login --with-token
gh auth status
```

## Local secrets

Secrets are intentionally kept out of git.

- NanoGPT key: `~/.config/opencode/local/nanogpt-api-key`
- NanoGPT base URL: `~/.config/opencode/local/nanogpt-base-url`
- Local VPN route URL: `~/.config/opencode/local/local-vpn-base-url`
- Local VPN placeholder key: `~/.config/opencode/local/local-vpn-api-key`
- Optional Supermemory config: `~/.config/opencode/supermemory.jsonc`
- `gh` auth: `~/.config/gh/hosts.yml` (managed by `gh auth login`) or `GH_TOKEN`

The installer currently seeds the local VPN provider with:

- URL: `http://localhost:4141/`
- API key: a non-sensitive placeholder value

Change those local files if your VPN route or local proxy changes.

## Providers and models

Default models:

- Main model: `nano-gpt/xiaomi/mimo-v2-pro`
- Small model: `nano-gpt/xiaomi/mimo-v2-flash`
- Permission mode: explicit yolo via `permission: "allow"`
- Enabled providers: `nano-gpt`, `local-vpn`, `opencode`

Available curated NanoGPT models include:

- `nano-gpt/xiaomi/mimo-v2-omni`
- `nano-gpt/xiaomi/mimo-v2-pro`
- `nano-gpt/xiaomi/mimo-v2-flash`
- `nano-gpt/xiaomi/mimo-v2-flash-thinking`
- `nano-gpt/xiaomi/mimo-v2-flash-thinking-original`
- `nano-gpt/xiaomi/mimo-v2-flash-original`

Local VPN-routed catalog:

- mirrors the current IDs returned by `http://localhost:4141/v1/models`
- currently exposes 42 unique models, including Claude 4.x, Gemini 2.5/3.x, GPT 3.5/4/4o/5.x, Grok Code Fast, OSWE VSCode models, and embedding models

Switch models inside OpenCode with `/model`, or by editing `model` in `opencode.jsonc`.
If you want to use OpenCode Zen, run `/connect` in the TUI or `opencode providers login`, then select OpenCode Zen.

## Key files

- `opencode.jsonc`: runtime config, providers, agents, MCP, LSP, and commands
- `tui.jsonc`: TUI-only settings
- `themes/nano-forge.json`: custom theme
- `instructions/*.md`: always-loaded operating rules
- `agents/*.md`: reusable specialized subagents
- `bin/*`: local wrappers that make LSP resolution predictable across machines
- `install.sh`: portable installer and local secret bootstrap (now also bootstraps `gh` rootless)
- `INFO.md`: engineering guide for extending or reworking this package

## Common pitfalls

- `Error: Configuration is invalid ... bad file reference ... local/* does not exist` — `install.sh` creates these; if you copied the repo manually, run `./install.sh` or `mkdir -p local && echo '...' > local/nanogpt-api-key` etc.
- `node --version` shows `10.x` (conda shadowing nvm) despite having `nvm` — put NVM init **after** conda in `~/.bashrc`:
  ```bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  export PATH="$NVM_DIR/versions/node/v24.13.1/bin:$PATH"
  ```
  Then `source ~/.bashrc; nvm install 24`.
- Slow `opencode` startup — check `opencode debug startup`; keep `watcher.ignore` broad and `snapshot: false` for large repos; heavy plugins increase startup.
- `gh: command not found` after install — `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc`.
- NanoGPT auth errors after install — non-interactive mode seeds a placeholder key; replace `~/.config/opencode/local/nanogpt-api-key` with a real key.

## Recommended first steps

- Run `/memory-bootstrap` in a new repository after enabling Supermemory.
- Use `/map-repo` before deep refactors in unfamiliar monorepos.
- Use `/deep-review path/or/branch` for high-signal review passes.
- Read `INFO.md` before changing provider definitions, installer behavior, agents, or LSP wiring.
