#!/usr/bin/env bash
# Installer for opencode-config — friendly to macOS/Linux on amd64 and arm64.
#
# Usage:
#   ./install.sh                 # install / update shared config (backs up existing)
#   ./install.sh --no-plugins    # skip npm plugin install (opencode auto-downloads @latest anyway)
#
# What it does:
#   1. Detects OS + arch (darwin/linux x arm64/x86_64) and installs the opencode
#      binary via the official installer if missing (official builds exist for all 4 combos).
#   2. Backs up ~/.config/opencode to ~/.config/opencode.bak.<timestamp>.
#   3. Copies plugins/, agents/, skills/ (arch-independent JS/Markdown).
#   4. Merges opencode.jsonc: keeps YOUR provider/model/auth, adds shared
#      agents, commands, plugins, watcher ignores, lsp disables.
#   5. Merges tui.json: keeps your theme, adds the forgecode sidebar widget.
#   6. Copies forge-config.jsonc / opencode-mem.jsonc / acp.jsonc only if absent
#      (these are plugin-managed after first run — never clobbered).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
INSTALL_PLUGINS=1

for arg in "$@"; do
  case "$arg" in
    --no-plugins) INSTALL_PLUGINS=0 ;;
    -h|--help) sed -n '1,12p' "$0"; exit 0 ;;
  esac
done

OS="$(uname -s)"; ARCH="$(uname -m)"
echo "Detected: $OS / $ARCH"

case "$OS" in
  Darwin|Linux) ;;
  *) echo "Unsupported OS: $OS (need macOS or Linux)"; exit 1 ;;
esac
case "$ARCH" in
  arm64|aarch64|x86_64|amd64) ;;
  *) echo "Unsupported arch: $ARCH (need arm64 or x86_64)"; exit 1 ;;
esac

if ! command -v opencode >/dev/null 2>&1; then
  echo "opencode not found — installing via official installer (handles $OS/$ARCH)..."
  curl -fsSL https://opencode.ai/install | bash
  hash -r || true
else
  echo "opencode found: $(opencode --version 2>/dev/null || echo unknown)"
fi

if [ -d "$CONFIG_DIR" ]; then
  BACKUP="$CONFIG_DIR.bak.$(date +%Y%m%d-%H%M%S)"
  echo "Backing up $CONFIG_DIR -> $BACKUP"
  cp -R "$CONFIG_DIR" "$BACKUP"
else
  mkdir -p "$CONFIG_DIR"
fi

for d in plugins agents skills; do
  if [ -d "$REPO_DIR/$d" ]; then
    mkdir -p "$CONFIG_DIR/$d"
    cp -R "$REPO_DIR/$d/." "$CONFIG_DIR/$d/"
    echo "Synced $d/"
  fi
done

# Merge JSONC configs with python3 (present by default on macOS + most Linux).
if command -v python3 >/dev/null 2>&1; then
  REPO_DIR="$REPO_DIR" CONFIG_DIR="$CONFIG_DIR" python3 - <<'EOF'
import json, os, re

def load_jsonc(path):
    with open(path) as f:
        text = f.read()
    # Strip // comments without touching URLs inside strings.
    out, i, n, s = [], 0, len(text), None
    while i < n:
        c = text[i]
        if s:
            out.append(c)
            if c == '\\' and i + 1 < n:
                out.append(text[i + 1]); i += 2; continue
            if c == s:
                s = None
            i += 1; continue
        if c in '"\'':
            s = c; out.append(c); i += 1; continue
        if c == '/' and i + 1 < n and text[i + 1] == '/':
            while i < n and text[i] != '\n':
                i += 1
            continue
        out.append(c); i += 1
    text = re.sub(r',\s*([}\]])', r'\1', ''.join(out))  # trailing commas
    return json.loads(text)

def merge(base, overlay):
    """Deep-merge overlay into base; overlay wins except provider/model/plugin which union."""
    for k, v in overlay.items():
        if k == 'plugin' and isinstance(v, list):
            base[k] = list(dict.fromkeys(list(base.get(k, [])) + v))
        elif k == 'provider' and isinstance(v, dict):
            base.setdefault(k, {})
            for pk, pv in v.items():
                base[k].setdefault(pk, pv)  # never clobber user's providers
        elif k in ('model', 'theme') and k in base:
            continue  # keep the user's own model/theme
        elif isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        else:
            base.setdefault(k, v)
    return base

repo = os.environ['REPO_DIR']
cfg = os.environ['CONFIG_DIR']

# opencode.jsonc
repo_cfg = load_jsonc(os.path.join(repo, 'opencode.jsonc'))
user_path = os.path.join(cfg, 'opencode.jsonc')
if os.path.exists(user_path):
    user_cfg = load_jsonc(user_path)
    merged = merge(user_cfg, repo_cfg)
else:
    merged = repo_cfg
with open(user_path, 'w') as f:
    json.dump(merged, f, indent=2)
print('Merged opencode.jsonc (your provider/model kept)')

# tui.json
repo_tui = load_jsonc(os.path.join(repo, 'tui.json'))
tui_path = os.path.join(cfg, 'tui.json')
if os.path.exists(tui_path):
    user_tui = load_jsonc(tui_path)
    user_tui.setdefault('plugin', [])
    for p in repo_tui.get('plugin', []):
        if p not in user_tui['plugin']:
            user_tui['plugin'].append(p)
    for k, v in repo_tui.items():
        user_tui.setdefault(k, v)
    merged_tui = user_tui
else:
    merged_tui = repo_tui
with open(tui_path, 'w') as f:
    json.dump(merged_tui, f, indent=2)
print('Merged tui.json (your theme kept)')
EOF
else
  echo "WARNING: python3 not found — copying repo opencode.jsonc/tui.json only if absent."
  for f in opencode.jsonc tui.json; do
    [ -f "$CONFIG_DIR/$f" ] || cp "$REPO_DIR/$f" "$CONFIG_DIR/$f"
  done
fi

# Plugin-managed files: only seed when absent.
for f in opencode-mem.jsonc acp.jsonc; do
  if [ -f "$REPO_DIR/$f" ] && [ ! -f "$CONFIG_DIR/$f" ]; then
    cp "$REPO_DIR/$f" "$CONFIG_DIR/$f"
    echo "Seeded $f (plugin will manage it from here)"
  fi
done

if [ "$INSTALL_PLUGINS" = 1 ]; then
  if command -v npm >/dev/null 2>&1 && [ -f "$REPO_DIR/package.json" ]; then
    echo "Pre-installing plugins (pure JS — same bits on amd64 and arm64)..."
    (cd "$REPO_DIR" && npm install --no-audit --no-fund 2>&1 | tail -n 3) || \
      echo "npm install failed — continuing, opencode auto-downloads plugins on start."
  else
    echo "npm not found — skipping pre-install (opencode auto-downloads plugins on start)."
  fi
fi

echo ""
echo "Done. Optional, per-arch extras:"
echo "  snip (token-saving shell proxy, used by opencode-snip):"
echo "    macOS : brew install edouard-claude/tap/snip"
echo "    linux : go install github.com/edouard-claude/snip/cmd/snip@latest"
echo "  Verify: opencode debug startup && opencode run 'Reply with exactly: ok'"
