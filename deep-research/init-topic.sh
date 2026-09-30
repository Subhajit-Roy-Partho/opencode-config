#!/usr/bin/env bash
# init-topic.sh — scaffold one isolated deep-research topic folder.
# Usage: init-topic.sh "<Topic Title>"
# Creates ~/Documents/deep-research/<slug>/ with state, manifest, logs, pdfs.
set -u

[ $# -ge 1 ] || { echo "usage: $(basename "$0") \"<Topic Title>\"" >&2; exit 2; }
TOPIC="$*"
# slugify: lowercase, non-alnum -> hyphen, trim hyphens
SLUG="$(printf '%s' "$TOPIC" | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9]\+/-/g' -e 's/^-\+//;s/-\+$//' | cut -c1-60 | sed -e 's/-$//')"
[ -n "$SLUG" ] || SLUG="topic-$(date -u +%Y%m%dT%H%M%SZ)"
ROOT="$HOME/Documents/deep-research/$SLUG"

if [ -e "$ROOT" ]; then
  echo "exists: $ROOT (refusing to overwrite; delete it first to restart cleanly)"
  exit 0
fi

mkdir -p "$ROOT/logs/iter-0" "$ROOT/pdfs"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$ROOT/manifest.json" <<EOF
{
  "topic": "$TOPIC",
  "slug": "$SLUG",
  "createdAt": "$NOW",
  "effortTier": "tbd",
  "budgets": {"maxExpansionRounds": 6, "maxScholarlyLookups": 120},
  "stopReason": null
}
EOF

echo "[]" > "$ROOT/sources.json"

cat > "$ROOT/research-state.md" <<EOF
# Deep research state — $TOPIC

- slug: \`$SLUG\`
- created: $NOW
- status: SCOPING (iteration 0 — fill coverage checklist before any retrieval)

## Coverage checklist

- [ ] OPEN — sub-question 1 (define before searching)
- [ ] OPEN — sub-question 2
- [ ] OPEN — sub-question 3

## Iteration log

| iter | date (UTC) | sweep | novel facts | checklist delta | next |
|------|------------|-------|-------------|-----------------|------|
| 0 | $NOW | scope only | — | checklist drafted | Tier 1 broad sweep |

## Convergence

- stopReason: none yet (complete checklist / <10% novel x2 / saturation / budget)
- lookupsUsed: 0 / 120

## Notes

- Tier order: Scopus → Crossref → S2 → arXiv → OpenAlex → LibKey OA → Firecrawl scrape → web last.
- PDFs to \`pdfs/\` OA-only. Raw outputs to \`logs/iter-N/\`.
EOF

cat > "$ROOT/report.md" <<EOF
# $TOPIC — deep research report

> Status: IN PROGRESS (written only after convergence or budget stop fires).
> Delete this whole folder (\`~/Documents/deep-research/$SLUG/\`) to discard the study.
EOF

echo "created: $ROOT"
