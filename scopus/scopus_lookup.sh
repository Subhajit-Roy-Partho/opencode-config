#!/usr/bin/env bash
# scopus_lookup.sh — Scopus search via Elsevier Scopus Search API.
#
# Usage:
#   scopus_lookup.sh --query "some keywords"   (TITLE-ABS-KEY search, count 5)
#   scopus_lookup.sh --doi 10.xxxx/yyyy
#
# Env (never commit values — export in your shell only):
#   SCOPUS_API_KEY      API key from https://dev.elsevier.com
#   ELSEVIER_INST_TOKEN optional institutional token (X-ELS-Insttoken) from
#                       Elsevier support; needed with the API key for full
#                       off-campus entitlement. On ASU campus IP / ASU VPN the
#                       key alone is usually enough.
#
# On success prints per hit: title, first author, venue, date, DOI,
# citedby-count, scopus URL.
# On missing key or HTTP error prints a useful fallback + one-line note —
# never an error.
set -u

usage() {
  echo "usage: $(basename "$0") --query TEXT | --doi DOI" >&2
  exit 2
}

MODE=""; VAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --query) MODE="query"; VAL="${2:-}"; shift 2 ;;
    --doi)   MODE="doi";   VAL="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done
[ -n "$VAL" ] || usage

for cmd in curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "fallback: use crossref/crossref_lookup.sh or semantic-scholar/s2_lookup.sh (no key required)"
    echo "note: $cmd not installed; install $cmd for live Scopus lookups (SCOPUS_API_KEY also required)."
    exit 0
  fi
done

# Never print credential values.
API_KEY="${SCOPUS_API_KEY:-}"
INST_TOKEN="${ELSEVIER_INST_TOKEN:-}"

if [ -z "$API_KEY" ]; then
  echo "fallback: use crossref/crossref_lookup.sh or semantic-scholar/s2_lookup.sh (no key required)"
  echo "note: SCOPUS_API_KEY is unset (request a key at https://dev.elsevier.com); off-campus full entitlement also needs X-ELS-Insttoken (ELSEVIER_INST_TOKEN) from Elsevier support or ASU VPN."
  exit 0
fi

if [ "$MODE" = "query" ]; then
  # Quote user text so multi-word queries stay one TITLE-ABS-KEY phrase.
  Q="TITLE-ABS-KEY(${VAL})"
else
  Q="DOI(${VAL})"
fi

RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT
CURL_ARGS=(-sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 \
  -H "X-ELS-APIKey: $API_KEY" -H "Accept: application/json")
if [ -n "$INST_TOKEN" ]; then
  CURL_ARGS+=(-H "X-ELS-Insttoken: $INST_TOKEN")
fi
HTTP_CODE="$(curl "${CURL_ARGS[@]}" --get --data-urlencode "query=$Q" \
  --data-urlencode "count=5" --data-urlencode "view=STANDARD" \
  "https://api.elsevier.com/content/search/scopus" 2>/dev/null)" || HTTP_CODE="000"

if [ "$HTTP_CODE" != "200" ]; then
  echo "fallback: use crossref/crossref_lookup.sh or semantic-scholar/s2_lookup.sh (no key required)"
  echo "note: Scopus API HTTP ${HTTP_CODE}; check SCOPUS_API_KEY (and ELSEVIER_INST_TOKEN / ASU VPN for off-campus entitlement)."
  exit 0
fi

jq -r '
  (."search-results".entry // []) | to_entries[] |
  "--- hit \(.key + 1) ---",
  "title: \(.value["dc:title"] // "n/a")",
  "firstAuthor: \(.value["dc:creator"] // "n/a")",
  "venue: \(.value["prism:publicationName"] // "n/a")",
  "date: \(.value["prism:coverDate"] // "n/a")",
  "doi: \(.value["prism:doi"] // "n/a")",
  "citedbyCount: \(.value["citedby-count"] // "n/a")",
  "scopusUrl: \((.value.link // [] | map(select(.["@ref"] == "scopus")) | .[0]."@href") // "n/a")"
' "$RESP_FILE"
