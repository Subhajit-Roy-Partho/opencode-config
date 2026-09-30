#!/usr/bin/env bash
# openalex_lookup.sh — OpenAlex works lookup (keyless with polite-pool mailto).
# Direct REST fallback for when the `openalex` MCP server is unavailable.
#
# Usage:
#   openalex_lookup.sh --query "some keywords"   (per-page 5)
#   openalex_lookup.sh --doi 10.xxxx/yyyy        (single work filter)
#
# Env (never commit values):
#   OPENALEX_MAILTO  contact email for the polite pool (preferred)
#   CROSSREF_MAILTO  accepted as alias (CROSSREF_MAILTO takes a back seat;
#                    OPENALEX_MAILTO wins when both are set)
#   OPENALEX_API_KEY optional (literature-search key; sent as api_key param)
#
# Prints per hit: title, authors, venue, year, DOI, cited_by_count,
# open-access flag + best OA URL.
# On missing deps, rate limit, or HTTP error prints a fallback + one-line
# note — never an error.
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
    echo "fallback: search https://openalex.org/works?search=${VAL}"
    echo "note: $cmd not installed; install $cmd for live OpenAlex lookups."
    exit 0
  fi
done

MAILTO="${OPENALEX_MAILTO:-${CROSSREF_MAILTO:-}}"
API_KEY="${OPENALEX_API_KEY:-}"
UA="opencode-openalex-lookup/1.0 (mailto:${MAILTO:-unknown})"

RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT

if [ "$MODE" = "query" ]; then
  URL="https://api.openalex.org/works?per-page=5&select=id,doi,title,authorships,primary_location,publication_year,cited_by_count,open_access"
  Q_ARGS=(--data-urlencode "search=$VAL")
else
  URL="https://api.openalex.org/works?select=id,doi,title,authorships,primary_location,publication_year,cited_by_count,open_access"
  Q_ARGS=(--data-urlencode "filter=doi:$VAL")
fi
[ -n "$MAILTO" ] && Q_ARGS+=(--data-urlencode "mailto=$MAILTO")
[ -n "$API_KEY" ] && Q_ARGS+=(--data-urlencode "api_key=$API_KEY")

HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 \
  -H "User-Agent: $UA" --get "${Q_ARGS[@]}" "$URL" 2>/dev/null)" || HTTP_CODE="000"

if [ "$HTTP_CODE" = "429" ]; then
  echo "fallback: search https://openalex.org/works?search=${VAL}"
  echo "note: OpenAlex rate-limited (HTTP 429); retry in ~40s or set OPENALEX_MAILTO / OPENALEX_API_KEY for polite-pool priority."
  exit 0
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "fallback: search https://openalex.org/works?search=${VAL}"
  echo "note: OpenAlex API HTTP ${HTTP_CODE}; retry later or use the fallback link."
  exit 0
fi

jq -r '
  (.results // [.]) | to_entries[] |
  select(.value.id != null) |
  "--- hit \(.key + 1) ---",
  "title: \(.value.title // "n/a")",
  "authors: \([.value.authorships[]? | .author.display_name // ""] | if length == 0 then "n/a" else join("; ") end)",
  "venue: \(.value.primary_location.source.display_name // "n/a")",
  "year: \(.value.publication_year // "n/a")",
  "doi: \((.value.doi // "n/a") | sub("^https://doi.org/"; ""))",
  "citedBy: \(.value.cited_by_count // "n/a")",
  "openAccess: \(.value.open_access.is_oa // "n/a")",
  "oaUrl: \(.value.open_access.best_oa_location.pdf_url // .value.open_access.best_oa_location.landing_page_url // "n/a")"
' "$RESP_FILE"
