#!/usr/bin/env bash
# handoff/to-claude.sh — OpenCode -> Claude handover (headless via `claude -p`).
# Usage: to-claude.sh "prompt text..." | to-claude.sh -f prompt-file
# Refuses any permission-bypass flag (pass none; user opt-in only, never injected).
# Logs stdout + exit code to /tmp/opencode/handoff-<ts>-claude.log; never prints env secrets.
set -u
LOGDIR="/tmp/opencode"

usage() { echo "usage: $(basename "$0") \"prompt...\" | $(basename "$0") -f prompt-file" >&2; exit 2; }
[ "$#" -eq 0 ] && usage

case "$*" in
  *dangerously-skip-permissions*|*allow-dangerously-skip-permissions*)
    echo "refused: permission-bypass flags are never injected (explicit user opt-in only)" >&2
    exit 3
    ;;
esac

if [ "${1:-}" = "-f" ]; then
  [ "$#" -eq 2 ] && [ -f "$2" ] || usage
  PROMPT="$(cat "$2")"
else
  PROMPT="$*"
fi
[ -n "$PROMPT" ] || usage

mkdir -p "$LOGDIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOGDIR/handoff-${TS}-claude.log"

START="$(date +%s)"
OUT="$(claude -p "$PROMPT" 2>&1)"
CODE="$?"
END="$(date +%s)"

{
  echo "=== to-claude ==="
  echo "utc: $TS  exit: $CODE  elapsed_s: $((END - START))"
  echo "--- prompt ---"
  printf '%s\n' "$PROMPT"
  echo "--- output ---"
  printf '%s\n' "$OUT"
} | tee "$LOG" >/dev/null
printf 'LOG: %s\n' "$LOG" >&2
printf '%s\n' "$OUT"
exit "$CODE"
