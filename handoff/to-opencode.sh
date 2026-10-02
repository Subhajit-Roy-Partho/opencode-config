#!/usr/bin/env bash
# handoff/to-opencode.sh — Claude -> OpenCode handover (headless, one-shot).
# Usage: to-opencode.sh "prompt text..." | to-opencode.sh -f prompt-file
# Model: repo default overridden by $OPENCODE_HANDOFF_MODEL.
# Logs stdout + exit code to /tmp/opencode/handoff-<ts>-opencode.log; never prints env secrets.
set -u
LOGDIR="/tmp/opencode"
MODEL="${OPENCODE_HANDOFF_MODEL:-opencode-go/muse-spark-1.3-contributor}"

usage() { echo "usage: $(basename "$0") \"prompt...\" | $(basename "$0") -f prompt-file" >&2; exit 2; }
[ "$#" -eq 0 ] && usage

if [ "${1:-}" = "-f" ]; then
  [ "$#" -eq 2 ] && [ -f "$2" ] || usage
  PROMPT="$(cat "$2")"
else
  PROMPT="$*"
fi
[ -n "$PROMPT" ] || usage

mkdir -p "$LOGDIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOGDIR/handoff-${TS}-opencode.log"

START="$(date +%s)"
OUT="$(opencode run --model "$MODEL" "$PROMPT" 2>&1)"
CODE="$?"
END="$(date +%s)"

{
  echo "=== to-opencode ==="
  echo "utc: $TS  model: $MODEL  exit: $CODE  elapsed_s: $((END - START))"
  echo "--- prompt ---"
  printf '%s\n' "$PROMPT"
  echo "--- output ---"
  printf '%s\n' "$OUT"
} | tee "$LOG" >/dev/null
printf 'LOG: %s\n' "$LOG" >&2
printf '%s\n' "$OUT"
exit "$CODE"
