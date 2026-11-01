---
name: deep-research
description: Exhaustive academic literature research. Use ONLY when the user explicitly requests deep-research, deep research agent, or exhaustive literature review. Tiered scholarly loop (Crossref/S2/Scopus/arXiv/OpenAlex first, LibKey OA-gated then ASU-licensed full text, Firecrawl scrape, general web last) with coverage-checklist convergence, citation snowballing, corroboration tags, PRISMA counts, and per-topic persistence under ~/Documents/deep-research/.
---

# Deep Research

Exhaustive, hours-long academic literature workflow. Accuracy and citation quality outrank speed. Routine lookups belong to `@librarian`, not here.

## Gate

Run only on explicit user request naming deep-research / deep research agent / exhaustive literature review. Otherwise refuse and ask for confirmation.

## Setup (every run)

1. Slugify topic → `~/Documents/deep-research/<topic-slug>/` via:
   `~/.config/opencode/deep-research/init-topic.sh "<Topic>"`
2. Write `research-state.md`: sub-questions (3–8), 5 seed papers (recall test), per-DB boolean strategies + keyword expansion, effort tier, budget caps (default 6 expansion rounds / 120 scholarly lookups), DB triangulation list with dates.
3. Mandatory plan-confirmation gate: present plan, ask before burning budget; accept interrupt/refine mid-run.
4. Create `manifest.json`, `sources.json` (`[]`; include `viaAsuLibrary` flag), `logs/`, `pdfs/`.

## Tier order (never invert)

1. Tier 1: Crossref wrapper → S2 wrapper → Scopus wrapper (skip-first if `SCOPUS_API_KEY` unset; log thin-view skip) → arXiv MCP (`arxiv_search`, `arxiv_get_metadata`, `arxiv_read_paper`; bash fallback `arxiv/arxiv_lookup.sh`) → OpenAlex MCP (`openalex_search_entities`, `openalex_resolve_name` before entity filters, `openalex_get_citation_graph` 1–2 hop snowball; bash fallback `openalex/openalex_lookup.sh`). Deduplicate by normalized DOI (merge flags, one record per DOI).
2. Tier 2: LibKey OA check (save PDF only if `openAccess: true`; keyless = degraded retraction gating, say so) → **ASU-licensed full text** (`asu_status` pre-check → `asu_search`, DOI best → `asu_fulltext` → `asu_fetch`; memory/logs only, never `pdfs/` unless OA; log `logs/iter-N/asu-*.txt`; set `viaAsuLibrary: true`; licensed access, not bypass) → paper full text via `firecrawl-cloud` research tools when live (`FIRECRAWL_API_KEY` + restart), else `arxiv_read_paper` or OpenAlex `oaUrl` + `firecrawl_scrape` on self-hosted (`FIRECRAWL_API_URL=http://localhost:3002`, `timeout: 30000`; fallback `webfetch`). NOTE: `firecrawl_research_*` 404 on self-hosted `-mcp` — use `-cloud`.
3. Tier 3: general web (`firecrawl_search`, then `firecrawl_agent` for gaps, then `websearch`/`webfetch`) + one grey-lit pass, only for Tier 1 gaps. Label Tier 3 `unverified-single-source`.

Rank: influential citations + recency + OA.

## Loop

- Iteration 0 broad parallel heterogeneous queries per sub-question; narrow progressively (reason → search → interpret → pivot; backtrack on contradiction).
- Each iteration: sweep → log to `logs/iter-N/` → novel-fact extraction → checklist update (answered/partial/open) → snowball top-3 influential hits (backward refs, forward cited-by).
- After each iteration, test stop: checklist complete, OR <10% novel facts × 2 iterations, OR 0 new eligible in a snowball round (saturation), OR budget cap (6/120) / user cancel. Record stop reason.
- Resilience: `asu_status`-first (`bridgeConnected: false` → retry once, continue Tier 1; `signedIn: false` → skip ASU that round); ASU calls serial (single-bridge queuing); 429 backoff + retry everywhere; `asu_*` has no timeout key — bound `max_chars`, page with `offset`. Never restart; resume from state.

## Synthesis

After stop: `report.md` with per-claim inline DOI citations, PRISMA counts table, corroboration tags (`2+ independent` / `single` / `conflicting`), contradictions + gaps sections, confidence labels (`verified-multi-source` / `single-reputable-source` / `unverified-single-source`), methods appendix (seed recall, queries/dates, tools, stop reason, coverage table). Surface retraction / expression-of-concern flags; exclude retracted work except to note it.

## Rules

- One folder per topic; nothing outside it. Delete folder = delete study.
- Keys from env only; never print values.
- No paywall bypass; ASU reads are licensed access. OA-only downloads to `pdfs/`.
- Update `research-state.md` every iteration (crash-safe resume).
