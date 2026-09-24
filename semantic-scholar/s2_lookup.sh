#!/usr/bin/env bash
# s2_lookup.sh — Semantic Scholar lookup (keyless-safe, keyed-fast).
#
# Usage:
#   s2_lookup.sh --query "some keywords"   (limit 5)
#   s2_lookup.sh --doi 10.xxxx/yyyy        (DOI: prefix lookup)
#
# Env (never commit values — export in your shell only):
#   SEMANTIC_SCHOLAR_API_KEY  optional key from https://www.semanticscholar.org/product/api#api-key-dashboard
#                             (S2_API_KEY accepted as alias; SEMANTIC_SCHOLAR_API_KEY takes precedence)
#
# Keyless callers are rate-limited (sleep 3s before request); keyed callers
# sleep 1s. Prints per hit: title, year, venue, citationCount +
# influentialCitationCount, openAccessPdf URL when present, DOI.
# On missing deps or HTTP error prints a fallback + one-line note — never
# an error.
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
    echo "fallback: search https://www.semanticscholar.org/search?q=${VAL}"
    echo "note: $cmd not installed; install $cmd for live Semantic Scholar lookups."
    exit 0
  fi
done

# Accept SEMANTIC_SCHOLAR_API_KEY (primary) or S2_API_KEY (alias); never print values.
API_KEY="${SEMANTIC_SCHOLAR_API_KEY:-${S2_API_KEY:-}}"
FIELDS="title,authors,year,abstract,citationCount,influentialCitationCount,openAccessPdf,externalIds,venue,url"

if [ -z "$API_KEY" ]; then
  sleep 3
else
  sleep 1
fi

RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT
CURL_ARGS=(-sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25)
if [ -n "$API_KEY" ]; then
  CURL_ARGS+=(-H "x-api-key: $API_KEY")
fi

if [ "$MODE" = "query" ]; then
  HTTP_CODE="$(curl "${CURL_ARGS[@]}" --get \
    --data-urlencode "query=$VAL" --data-urlencode "limit=5" \
    --data-urlencode "fields=$FIELDS" \
    "https://api.semanticscholar.org/graph/v1/paper/search" 2>/dev/null)" || HTTP_CODE="000"
else
  HTTP_CODE="$(curl "${CURL_ARGS[@]}" --get \
    --data-urlencode "fields=$FIELDS" \
    "https://api.semanticscholar.org/graph/v1/paper/DOI:${VAL}" 2>/dev/null)" || HTTP_CODE="000"
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "fallback: search https://www.semanticscholar.org/search?q=${VAL}"
  echo "note: Semantic Scholar API HTTP ${HTTP_CODE}; retry later (keyless callers are rate-limited) or use the fallback link."
  exit 0
fi

if [ "$MODE" = "query" ]; then
  jq -r '
    (.data // []) | to_entries[] |
    "--- hit \(.key + 1) ---",
    "title: \(.value.title // "n/a")",
    "authors: \([.value.authors[]? | .name // ""] | if length == 0 then "n/a" else join("; ") end)",
    "year: \(.value.year // "n/a")",
    "venue: \(.value.venue // "n/a")",
    "citationCount: \(.value.citationCount // "n/a")",
    "influentialCitationCount: \(.value.influentialCitationCount // "n/a")",
    "openAccessPdf: \(.value.openAccessPdf.url // "n/a")",
    "doi: \(.value.externalIds.DOI // "n/a")",
    "url: \(.value.url // "n/a")"
  ' "$RESP_FILE"
else
  jq -r '
    . as $p |
    "title: \($p.title // "n/a")",
    "authors: \([ $p.authors[]? | .name // ""] | if length == 0 then "n/a" else join("; ") end)",
    "year: \($p.year // "n/a")",
    "venue: \($p.venue // "n/a")",
    "citationCount: \($p.citationCount // "n/a")",
    "influentialCitationCount: \($p.influentialCitationCount // "n/a")",
    "openAccessPdf: \($p.openAccessPdf.url // "n/a")",
    "doi: \($p.externalIds.DOI // "n/a")",
    "url: \($p.url // "n/a")",
    "abstract: \($p.abstract // "n/a")"
  ' "$RESP_FILE"
fi
