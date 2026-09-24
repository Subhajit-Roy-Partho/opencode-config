#!/usr/bin/env bash
# crossref_lookup.sh — Crossref metadata lookup (no key required).
#
# Usage:
#   crossref_lookup.sh --query "some bibliographic text"   (rows 5, ranked)
#   crossref_lookup.sh --doi 10.xxxx/yyyy                  (full citation)
#
# Env (never commit values — export in your shell only):
#   CROSSREF_MAILTO  optional contact email; when set it is appended as
#                    ?mailto= so Crossref's polite pool can contact you.
#                    Always sent with an identifying User-Agent.
#
# Query mode prints ranked hits: score + is-referenced-by-count + title,
# authors, venue, date, DOI, URL. DOI mode prints full citation fields.
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
    echo "fallback: search https://search.crossref.org/?q=${VAL}"
    echo "note: $cmd not installed; install $cmd for live Crossref lookups."
    exit 0
  fi
done

MAILTO="${CROSSREF_MAILTO:-}"
UA="opencode-crossref-lookup/1.0 (mailto:${MAILTO:-unknown})"
SELECT="DOI,title,author,published,container-title,is-referenced-by-count,score,URL"

RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT

if [ "$MODE" = "query" ]; then
  URL="https://api.crossref.org/works?rows=5&select=${SELECT}"
  if [ -n "$MAILTO" ]; then
    URL="${URL}&mailto=${MAILTO}"
  fi
  HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 \
    -H "User-Agent: $UA" --get --data-urlencode "query.bibliographic=$VAL" \
    "$URL" 2>/dev/null)" || HTTP_CODE="000"
else
  URL="https://api.crossref.org/works/${VAL}"
  if [ -n "$MAILTO" ]; then
    URL="${URL}?mailto=${MAILTO}"
  fi
  HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 \
    -H "User-Agent: $UA" \
    "$URL" 2>/dev/null)" || HTTP_CODE="000"
fi

# Polite-pool courtesy pause (one lookup per invocation; keeps us polite).
sleep 0.4

if [ "$HTTP_CODE" != "200" ]; then
  echo "fallback: search https://search.crossref.org/?q=${VAL}"
  echo "note: Crossref API HTTP ${HTTP_CODE}; retry later or use the fallback link."
  exit 0
fi

if [ "$MODE" = "query" ]; then
  jq -r '
    (.message.items // []) | to_entries[] |
    "--- hit \(.key + 1) (score: \(.value.score // "n/a"), citedBy: \(.value["is-referenced-by-count"] // "n/a")) ---",
    "title: \((.value.title // ["n/a"]) | join("; "))",
    "authors: \([.value.author[]? | "\(.given // "") \(.family // "")" | gsub("^ +| +$"; "")] | if length == 0 then "n/a" else join("; ") end)",
    "venue: \((.value["container-title"] // ["n/a"]) | join("; "))",
    "date: \((.value.published["date-parts"][0] // ["n/a"]) | map(tostring) | join("-"))",
    "doi: \(.value.DOI // "n/a")",
    "url: \(.value.URL // "n/a")"
  ' "$RESP_FILE"
else
  jq -r '
    .message as $m |
    "title: \(($m.title // ["n/a"]) | join("; "))",
    "authors: \([ $m.author[]? | "\(.given // "") \(.family // "")" | gsub("^ +| +$"; "")] | if length == 0 then "n/a" else join("; ") end)",
    "venue: \((($m["container-title"] // []) + ($m["short-container-title"] // []) | unique) | if length == 0 then "n/a" else join("; ") end)",
    "publisher: \($m.publisher // "n/a")",
    "date: \((($m.published // $m.created)["date-parts"][0] // ["n/a"]) | map(tostring) | join("-"))",
    "type: \($m.type // "n/a")",
    "doi: \($m.DOI // "n/a")",
    "citedBy: \($m["is-referenced-by-count"] // "n/a")",
    "referencesCount: \($m["references-count"] // "n/a")",
    "url: \($m.URL // $m.resource.primary.URL // "n/a")"
  ' "$RESP_FILE"
fi
