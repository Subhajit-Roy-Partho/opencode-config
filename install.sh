#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPENCODE_CONFIG_TARGET:-$HOME/.config/opencode}"
LOCAL_DIR="$TARGET_DIR/local"

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
    exit 1
  fi
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

  local api_key=""
  local base_url=""

  api_key="$(prompt_value "NanoGPT API key [hidden]: " "$existing_key" true)"
  if [[ -z "$api_key" ]]; then
    echo "A NanoGPT API key is required." >&2
    exit 1
  fi

  base_url="$(prompt_value "NanoGPT base URL [$existing_url]: " "$existing_url" false)"

  write_secret_file "$LOCAL_DIR/nanogpt-api-key" "$api_key"
  write_secret_file "$LOCAL_DIR/nanogpt-base-url" "$base_url"
}

configure_supermemory() {
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
}

main() {
  copy_repo
  ensure_opencode
  ensure_node
  install_dependencies
  configure_nanogpt
  configure_supermemory
  verify_install

  echo
  echo "OpenCode config installed at $TARGET_DIR"
  echo "NanoGPT secrets stored under $LOCAL_DIR"
  echo "Run 'opencode' to start, then use /map-repo or /memory-bootstrap in a new project."
}

main "$@"
