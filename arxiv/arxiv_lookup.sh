#!/usr/bin/env bash
# arxiv_lookup.sh — arXiv search via export.arxiv.org API (no key required).
# Direct REST fallback for when the `arxiv` MCP server is unavailable.
#
# Usage:
#   arxiv_lookup.sh --query "some keywords"   (max 5, sorted by relevance)
#   arxiv_lookup.sh --id 2301.12345           (single paper, version-insensitive)
#
# Prints per hit: title, authors, published, arXiv ID, DOI (when present),
# primary category, PDF link.
# On missing deps or HTTP error prints a fallback + one-line note — never
# an error.
set -u

usage() {
  echo "usage: $(basename "$0") --query TEXT | --id ARXIV_ID" >&2
  exit 2
}

MODE=""; VAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --query) MODE="query"; VAL="${2:-}"; shift 2 ;;
    --id)    MODE="id";    VAL="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done
[ -n "$VAL" ] || usage

for cmd in curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "fallback: search https://arxiv.org/search/?query=${VAL}&searchtype=all"
    echo "note: $cmd not installed; install $cmd for live arXiv lookups."
    exit 0
  fi
done

RESP_FILE="$(mktemp)"; trap 'rm -f "$RESP_FILE"' EXIT

if [ "$MODE" = "query" ]; then
  HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 --get \
    --data-urlencode "search_query=all:$VAL" \
    --data-urlencode "start=0" --data-urlencode "max_results=5" \
    --data-urlencode "sortBy=relevance" --data-urlencode "sortOrder=descending" \
    "https://export.arxiv.org/api/query" 2>/dev/null)" || HTTP_CODE="000"
else
  HTTP_CODE="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' --max-time 25 --get \
    --data-urlencode "id_list=$VAL" \
    "https://export.arxiv.org/api/query" 2>/dev/null)" || HTTP_CODE="000"
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "fallback: search https://arxiv.org/search/?query=${VAL}&searchtype=all"
  echo "note: arXiv API HTTP ${HTTP_CODE}; retry later or use the fallback link."
  exit 0
fi

# Parse Atom with python3 when available (no extra deps); else dump raw.
if command -v python3 >/dev/null 2>&1; then
  python3 - "$RESP_FILE" <<'EOF'
import sys, xml.etree.ElementTree as ET
ns = {'a': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception as e:
    print(f"fallback: search https://arxiv.org/search/?query=&searchtype=all\nnote: arXiv response unparseable ({e}).")
    sys.exit(0)
entries = root.findall('a:entry', ns)
if not entries:
    print("note: arXiv returned 0 hits; broaden the query or try crossref/crossref_lookup.sh.")
    sys.exit(0)
for i, e in enumerate(entries, 1):
    def text(tag):
        el = e.find(tag, ns)
        return ' '.join((el.text or 'n/a').split()) if el is not None else 'n/a'
    authors = '; '.join(a.findtext('a:name', default='', namespaces=ns) for a in e.findall('a:author', ns)) or 'n/a'
    pdf = 'n/a'
    for l in e.findall('a:link', ns):
        if l.get('title') == 'pdf':
            pdf = l.get('href', 'n/a')
    doi_el = e.find('arxiv:doi', ns)
    cat_el = e.find('arxiv:primary_category', ns)
    print(f"--- hit {i} ---")
    print(f"title: {text('a:title')}")
    print(f"authors: {authors}")
    print(f"published: {text('a:published')}")
    print(f"arxivId: {text('a:id')}")
    print(f"doi: {doi_el.text.strip() if doi_el is not None and doi_el.text else 'n/a'}")
    print(f"category: {cat_el.get('term', 'n/a') if cat_el is not None else 'n/a'}")
    print(f"pdf: {pdf}")
EOF
else
  echo "fallback: search https://arxiv.org/search/?query=${VAL}&searchtype=all"
  echo "note: python3 not installed; raw Atom saved nowhere — install python3 for parsed arXiv output."
  exit 0
fi
