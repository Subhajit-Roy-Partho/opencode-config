#!/usr/bin/env bash
# libkey_lookup.sh — LibKey article lookup (Third Iron public API) with
# keyless WAYFless fallback.
#
# Usage:
#   libkey_lookup.sh --doi 10.xxxx/yyyy   (DOI form preferred)
#   libkey_lookup.sh --pmid 12345678
#
# Env (never commit values — export in your shell only):
#   LIBKEY_ID   numeric library ID (default 158 = ASU, verified)
#   LIBKEY_KEY  API key from https://thirdiron.com/api-request (or LIBKEY_API_KEY)
#   LIBKEY_KEY  (actually LIBKEY_API_KEY) API key from the same request
#               (accepted under either name; LIBKEY_KEY takes precedence)
#
# On success prints: title, bestLink, recommendedLinkText, openAccess,
# retraction / expression-of-concern alert flags, browzineWebLink.
# On missing creds or HTTP error prints the keyless WAYFless fallback
# https://libkey.io/libraries/<ID>/<doi-or-pmid> instead — never an error.
set -u

usage() {
  echo "usage: $(basename "$0") --doi DOI | --pmid PMID" >&2
  exit 2
}

ID_TYPE=""; ID_VAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --doi)  ID_TYPE="doi";  ID_VAL="${2:-}"; shift 2 ;;
    --pmid) ID_TYPE="pmid"; ID_VAL="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done
[ -n "$ID_VAL" ] || usage

# Accept LIBKEY_KEY (primary) or LIBKEY_API_KEY (alias); never print values.
# ASU numeric Library ID is 158 (verified: ASU libguide links
# browzine.com/libraries/158 as "BrowZine at ASU Library", and the rendered
# libkey.io/libraries/158/<doi> page reads "Access Provided By Arizona
# State University Library"). Override via env only if it ever changes.
LIBKEY_ID="${LIBKEY_ID:-158}"
API_KEY="${LIBKEY_KEY:-${LIBKEY_API_KEY:-}}"

wayfless_fallback() {
  # $1 = human-readable reason (one line)
  local lib="${LIBKEY_ID:-158}"
  echo "fallback: https://libkey.io/libraries/${lib}/${ID_VAL}"
  echo "note: $1"
}

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    wayfless_fallback "$cmd not installed; install $cmd for live LibKey lookups (LIBKEY_ID/LIBKEY_KEY also required)."
    exit 0
  fi
done

if [ -z "$LIBKEY_ID" ] || [ -z "$API_KEY" ]; then
  wayfless_fallback "LIBKEY_KEY is unset (request at https://thirdiron.com/api-request); using keyless WAYFless link for ASU (library 158)."
  exit 0
fi

URL="https://public-api.thirdiron.com/public/v1/libraries/${LIBKEY_ID}/articles/${ID_TYPE}/${ID_VAL}?access_token=${API_KEY}"
RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT
HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --get \
  --max-time 25 "$URL" 2>/dev/null)" || HTTP_CODE="000"

if [ "$HTTP_CODE" != "200" ]; then
  wayfless_fallback "LibKey API HTTP ${HTTP_CODE}; using keyless WAYFless link."
  exit 0
fi

jq -r '
  .data as $d
  | (($d.alerts // []) | if length == 0 then "none"
      else map("\(.type // .category // "alert"): \(.message // .url // .)") | join("; ") end) as $alerts
  | "title: \($d.title // "n/a")",
    "bestLink: \($d.bestLink // "n/a")",
    "recommendedLinkText: \($d.recommendedLinkText // $d.contentLocation // "n/a")",
    "openAccess: \($d.openAccess | if . == null then "n/a" else . end)",
    "retracted: \($d.retracted | if . == null then "n/a" else . end)",
    "expressionOfConcern: \($d.expressionOfConcern | if . == null then "n/a" else . end)",
    "alerts: \($alerts)",
    "browzineWebLink: \($d.browzineWebLink // $d.browZineWebLink // "n/a")"
' "$RESP_FILE"
