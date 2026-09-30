---
name: deep-research
description: Exhaustive academic literature research. Use ONLY when the user explicitly requests deep-research, deep research agent, or exhaustive literature review. Tiered scholarly loop (Scopus/Crossref/S2/arXiv/OpenAlex first, LibKey OA-gated full text, Firecrawl scrape, general web last) with coverage-checklist convergence, citation expansion, corroboration, and per-topic persistence under ~/Documents/deep-research/.
---

# Deep Research

Exhaustive, hours-long academic literature workflow. Accuracy and citation quality outrank speed. Routine lookups belong to `@librarian`, not here.

## Gate

Run only on explicit user request naming deep-research / deep research agent / exhaustive literature review. Otherwise refuse and ask for confirmation.

## Setup (every run)

1. Slugify topic → `~/Documents/deep-research/<topic-slug>/` via:
   `~/.config/opencode/deep-research/init-topic.sh "<Topic>"`
2. Write `research-state.md`: sub-questions (3–8), effort tier, budget caps (default 6 expansion rounds / 120 scholarly lookups).
3. Create `manifest.json`, `sources.json` (`[]`), `logs/`, `pdfs/`.

## Tier order (never invert)

1. Scopus wrapper → Crossref wrapper → S2 wrapper → arXiv MCP (`arxiv_search`, `arxiv_get_metadata`, `arxiv_read_paper`; bash fallback `arxiv/arxiv_lookup.sh`) → OpenAlex MCP (`openalex_search_entities`, `openalex_resolve_name` before entity filters, `openalex_get_citation_graph` for citation expansion; bash fallback `openalex/openalex_lookup.sh`). Deduplicate by normalized DOI.
2. LibKey OA check (save PDF only if `openAccess: true`) → paper full text via `firecrawl-cloud` research tools when live (`FIRECRAWL_API_KEY` in server env + restart), else `arxiv_read_paper` or OpenAlex `oaUrl` + `firecrawl_scrape` on the self-hosted instance (`FIRECRAWL_API_URL=http://localhost:3002`, `timeout: 30000`; fallback `webfetch`). NOTE: `firecrawl_research_*` 404 on the self-hosted `-mcp` instance — use the `-cloud` instance.
3. General web (`firecrawl_search`, then `firecrawl_agent` for gap sub-questions, then `websearch`/`webfetch`) only for Tier 1 gaps. Label Tier 3 `unverified-single-source`.

Rank: influential citations + recency + OA.

## Loop

- Iteration 0 broad queries per sub-question; narrow progressively.
- Each iteration: sweep → log to `logs/iter-N/` → novel-fact extraction → checklist update → cite-expand top-3 influential hits (backward references, forward cited-by).
- After each iteration, test stop: checklist complete, OR <10% novel facts × 2 iterations, OR query saturation, OR budget cap. Record stop reason.
- Failures (429/timeout): back off, retry once, resume from state. Never restart.

## Synthesis

After stop: `report.md` with DOI-linked per-claim citations, contradictions section, confidence labels (`verified-multi-source` / `single-reputable-source` / `unverified-single-source`), methods appendix (queries, tools, stop reason, coverage table). Surface retraction / expression-of-concern flags; exclude retracted work except to note it.

## Rules

- One folder per topic; nothing outside it. Delete folder = delete study.
- Keys from env only; never print values.
- No paywall bypass; OA-only downloads.
- Update `research-state.md` every iteration (crash-safe resume).
