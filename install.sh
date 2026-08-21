#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPENCODE_CONFIG_TARGET:-$HOME/.config/opencode}"
LOCAL_DIR="$TARGET_DIR/local"

# Allow non-interactive installs via env vars or --yes / --non-interactive flag.
NONINTERACTIVE="${NONINTERACTIVE:-false}"
if [[ "${1:-}" == "--yes" || "${1:-}" == "--non-interactive" || "${1:-}" == "-y" ]]; then
  NONINTERACTIVE=true
fi

# If env vars pre-set, also treat as non-interactive for those prompts.
if [[ -n "${NANOGPT_API_KEY:-}" || -n "${SUPERMEMORY_API_KEY:-}" ]]; then
  NONINTERACTIVE="${NONINTERACTIVE:-false}"
  # don't force full non-interactive; just skip prompts where env covers it
  :
fi

copy_repo() {
  mkdir -p "$TARGET_DIR"

  if [[ "$SCRIPT_DIR" != "$TARGET_DIR" ]]; then
    if command -v rsync >/dev/null 2>&1; then
      rsync -a \
        --delete \
        --exclude ".git" \
        --exclude "node_modules" \
        --exclude "local" \
        --exclude "supermemory.json" \
        --exclude "supermemory.jsonc" \
        "$SCRIPT_DIR/" "$TARGET_DIR/"
    else
      echo "rsync is required when installing from outside $TARGET_DIR." >&2
      exit 1
    fi
  fi
}

prompt_value() {
  local prompt="$1"
  local default_value="${2:-}"
  local secret="${3:-false}"
  local value=""

  if [[ "$secret" == "true" ]]; then
    read -r -s -p "$prompt" value
    echo
  else
    read -r -p "$prompt" value
  fi

  if [[ -z "$value" ]]; then
    value="$default_value"
  fi

  printf '%s' "$value"
}

write_secret_file() {
  local file_path="$1"
  local contents="$2"
  mkdir -p "$(dirname "$file_path")"
  printf '%s' "$contents" > "$file_path"
  chmod 600 "$file_path"
}

ensure_gh() {
  if command -v gh >/dev/null 2>&1; then
    echo "gh already installed: $(gh --version | head -n1)"
    return
  fi

  echo "Installing github-cli (gh) without root..."
  local gh_version
  gh_version="$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -o '"tag_name": "v[^"]*"' | head -n1 | cut -d'"' -f4)"
  if [[ -z "$gh_version" ]]; then
    gh_version="v2.98.0"
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  local url="https://github.com/cli/cli/releases/download/${gh_version}/gh_${gh_version#v}_linux_amd64.tar.gz"
  echo "  downloading $url ..."
  curl -fsSL --retry 3 -o "$tmpdir/gh.tar.gz" "$url"
  tar -xzf "$tmpdir/gh.tar.gz" -C "$tmpdir"
  mkdir -p "$HOME/.local/bin"
  cp "$tmpdir"/gh_*_linux_amd64/bin/gh "$HOME/.local/bin/gh"
  chmod +x "$HOME/.local/bin/gh"
  # Man pages are optional; install if possible
  mkdir -p "$HOME/.local/share/man/man1" 2>/dev/null || true
  cp "$tmpdir"/gh_*_linux_amd64/share/man/man1/gh.1 "$HOME/.local/share/man/man1/" 2>/dev/null || true
  echo "  gh installed at $HOME/.local/bin/gh ($(gh --version | head -n1))"
  echo "  Make sure \$HOME/.local/bin is on PATH (already in .bash_profile on most hosts)."
  echo "  Authenticate with: gh auth login  (or set GH_TOKEN env var)"
}

ensure_opencode() {
  if command -v opencode >/dev/null 2>&1; then
    return
  fi

  echo "Installing opencode..."
  curl -fsSL https://opencode.ai/install | bash
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Node.js and npm are required to install provider and LSP dependencies." >&2
    echo "Install via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash && nvm install 24" >&2
    exit 1
  fi

  local node_ver
  node_ver="$(node --version | sed 's/^v//')"
  local major="${node_ver%%.*}"
  if [[ "$major" -lt 20 ]]; then
    echo "WARNING: Node $node_ver detected, but >=20 is required (package.json engines)." >&2
    echo "  Detected node: $(which node) ($(node --version))" >&2
    # Try to auto-fix if nvm has a newer version available
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
      # shellcheck disable=SC1090
      source "$HOME/.nvm/nvm.sh"
      if command -v nvm >/dev/null 2>&1 && nvm ls 24 >/dev/null 2>&1; then
        echo "  Switching to nvm node 24..." >&2
        nvm use 24 >/dev/null 2>&1 || true
        node_ver="$(node --version | sed 's/^v//')"
        major="${node_ver%%.*}"
        if [[ "$major" -ge 20 ]]; then
          echo "  Now using node $(node --version) at $(which node)" >&2
        fi
      fi
    fi
    if [[ "$major" -lt 20 ]]; then
      echo "  Fix: ensure NVM loads AFTER conda/miniconda in ~/.bashrc." >&2
      echo "  Add to end of ~/.bashrc:" >&2
      echo '    export NVM_DIR="$HOME/.nvm"' >&2
      echo '    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >&2
      echo '    export PATH="$NVM_DIR/versions/node/v24.13.1/bin:$PATH"' >&2
      echo "  Then: source ~/.bashrc && nvm install 24" >&2
      if [[ "$NONINTERACTIVE" == "true" ]]; then
        echo "  Continuing anyway (--non-interactive); npm install may fail with old node." >&2
      else
        echo "  Continuing; npm install may fail with old node. Fix PATH and re-run install.sh" >&2
      fi
    fi
  fi
  echo "Using node $(node --version) at $(which node) / npm $(npm --version)"
}

install_dependencies() {
  echo "Installing npm dependencies..."
  (
    cd "$TARGET_DIR"
    npm install --no-fund --no-audit
  )
}

configure_nanogpt() {
  mkdir -p "$LOCAL_DIR"

  local existing_key=""
  local existing_url="https://nano-gpt.com/api/v1"

  if [[ -f "$LOCAL_DIR/nanogpt-api-key" ]]; then
    existing_key="$(<"$LOCAL_DIR/nanogpt-api-key")"
  fi

  if [[ -f "$LOCAL_DIR/nanogpt-base-url" ]]; then
    existing_url="$(<"$LOCAL_DIR/nanogpt-base-url")"
  fi

  # Non-interactive via env vars
  local api_key=""
  local base_url=""

  if [[ -n "${NANOGPT_API_KEY:-}" ]]; then
    api_key="$NANOGPT_API_KEY"
    echo "Using NanoGPT API key from NANOGPT_API_KEY env var"
  elif [[ "$NONINTERACTIVE" == "true" ]]; then
    if [[ -n "$existing_key" ]]; then
      api_key="$existing_key"
      echo "Non-interactive: reusing existing NanoGPT key at $LOCAL_DIR/nanogpt-api-key"
    elif [[ -f "$LOCAL_DIR/nanogpt-api-key" ]]; then
      api_key="$(<"$LOCAL_DIR/nanogpt-api-key")"
    else
      # Seed placeholder so `opencode debug config` validates; user must replace later
      api_key="placeholder-nanogpt-key-replace-me"
      echo "Non-interactive: no NANOGPT_API_KEY set and no existing key."
      echo "  Seeding placeholder at $LOCAL_DIR/nanogpt-api-key"
      echo "  Replace it with a real key: echo 'sk-...' > $LOCAL_DIR/nanogpt-api-key && chmod 600 $LOCAL_DIR/nanogpt-api-key"
      echo "  Or re-run: NANOGPT_API_KEY='sk-...' ./install.sh"
    fi
  else
    api_key="$(prompt_value "NanoGPT API key [hidden]: " "$existing_key" true)"
    if [[ -z "$api_key" ]]; then
      echo "A NanoGPT API key is required (or set NANOGPT_API_KEY env var / use --non-interactive for placeholder)." >&2
      exit 1
    fi
  fi

  if [[ -n "${NANOGPT_BASE_URL:-}" ]]; then
    base_url="$NANOGPT_BASE_URL"
    echo "Using NanoGPT base URL from NANOGPT_BASE_URL env var: $base_url"
  elif [[ "$NONINTERACTIVE" == "true" ]]; then
    base_url="$existing_url"
  else
    base_url="$(prompt_value "NanoGPT base URL [$existing_url]: " "$existing_url" false)"
  fi

  # Don't overwrite a real key with placeholder if user already has a real one
  if [[ "$api_key" == "placeholder-nanogpt-key-replace-me" && -n "$existing_key" && "$existing_key" != "placeholder-nanogpt-key-replace-me" ]]; then
    api_key="$existing_key"
  fi

  write_secret_file "$LOCAL_DIR/nanogpt-api-key" "$api_key"
  write_secret_file "$LOCAL_DIR/nanogpt-base-url" "$base_url"
}

seed_local_vpn_provider() {
  local vpn_key_file="$LOCAL_DIR/local-vpn-api-key"
  local vpn_url_file="$LOCAL_DIR/local-vpn-base-url"

  if [[ ! -f "$vpn_key_file" ]]; then
    write_secret_file "$vpn_key_file" "local-vpn-routing-placeholder-key"
  fi

  if [[ ! -f "$vpn_url_file" ]]; then
    write_secret_file "$vpn_url_file" "http://localhost:4141/"
  fi
}

configure_supermemory() {
  # Env var shortcut
  if [[ -n "${SUPERMEMORY_API_KEY:-}" ]]; then
    echo "Configuring Supermemory from SUPERMEMORY_API_KEY env var"
    cat > "$TARGET_DIR/supermemory.jsonc" <<EOF
{
  "apiKey": "$SUPERMEMORY_API_KEY",
  "similarityThreshold": 0.63,
  "maxMemories": 8,
  "maxProjectMemories": 14,
  "maxProfileItems": 6,
  "injectProfile": true,
  "containerTagPrefix": "opencode",
  "compactionThreshold": 0.78
}
EOF
    chmod 600 "$TARGET_DIR/supermemory.jsonc"
    return
  fi

  if [[ "$NONINTERACTIVE" == "true" ]]; then
    echo "Skipping Supermemory prompt (non-interactive; set SUPERMEMORY_API_KEY to configure)."
    return
  fi

  local default_answer="n"
  if [[ -f "$TARGET_DIR/supermemory.jsonc" ]]; then
    default_answer="y"
  fi

  local answer=""
  answer="$(prompt_value "Configure Supermemory persistent memory? [y/N]: " "$default_answer" false)"
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"

  if [[ "$answer" != "y" && "$answer" != "yes" ]]; then
    return
  fi

  local existing_key=""
  if [[ -f "$TARGET_DIR/supermemory.jsonc" ]]; then
    existing_key="$(sed -n 's/.*"apiKey": "\(.*\)".*/\1/p' "$TARGET_DIR/supermemory.jsonc" | head -n 1 || true)"
  fi

  local supermemory_key=""
  supermemory_key="$(prompt_value "Supermemory API key [hidden]: " "$existing_key" true)"
  if [[ -z "$supermemory_key" ]]; then
    echo "Skipping Supermemory because no API key was provided."
    return
  fi

  cat > "$TARGET_DIR/supermemory.jsonc" <<EOF
{
  "apiKey": "$supermemory_key",
  "similarityThreshold": 0.63,
  "maxMemories": 8,
  "maxProjectMemories": 14,
  "maxProfileItems": 6,
  "injectProfile": true,
  "containerTagPrefix": "opencode",
  "compactionThreshold": 0.78
}
EOF
  chmod 600 "$TARGET_DIR/supermemory.jsonc"
}

verify_install() {
  echo "Verifying resolved config..."
  (
    cd "$TARGET_DIR"
    opencode debug config >/dev/null
  )
  echo "Checking startup time..."
  local elapsed
  elapsed="$( (time -p opencode debug startup >/dev/null 2>&1) 2>&1 | awk '/^real/ {print $2}' )"
  echo "  startup: ${elapsed}s (should be < 3s on this host)"
  if awk "BEGIN {exit !($elapsed > 3.0)}"; then
    echo "  WARNING: startup > 3s — check plugin list and watcher.ignore" >&2
  fi
}

main() {
  copy_repo
  ensure_gh
  ensure_opencode
  ensure_node
  install_dependencies
  configure_nanogpt
  seed_local_vpn_provider
  configure_supermemory
  verify_install

  echo
  echo "OpenCode config installed at $TARGET_DIR"
  echo "  gh: $(command -v gh 2>/dev/null || echo 'not on PATH — add \$HOME/.local/bin to PATH')"
  echo "NanoGPT secrets stored under $LOCAL_DIR"
  echo "Local VPN gpt-5-mini route seeded under $LOCAL_DIR"
  if grep -q "placeholder-nanogpt-key" "$LOCAL_DIR/nanogpt-api-key" 2>/dev/null; then
    echo "NOTE: NanoGPT placeholder key in place — replace with real key:"
    echo "  echo 'sk-...' > $LOCAL_DIR/nanogpt-api-key && chmod 600 $LOCAL_DIR/nanogpt-api-key"
  fi
  echo "Run 'opencode' to start, then use /map-repo or /memory-bootstrap in a new project."
  echo "For gh: gh auth login  (or export GH_TOKEN=...)"
}

main "$@"
