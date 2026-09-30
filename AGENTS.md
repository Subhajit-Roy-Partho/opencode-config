# AGENTS.md — global agent instructions (`~/.config/opencode/`)

Agents: read this file for tool-routing policy before doing research.
Human details live in `README.md`; this file is the routing rule.

## Web pages

- Try `firecrawl-mcp_*` tools first (local Docker, `FIRECRAWL_API_URL=http://localhost:3002`, `timeout: 30000` for cold starts).
- On connection/timeout failure, fall back to built-in `webfetch`/`websearch`; never treat the fallback as an error.

## Scientific articles (in this order)

a. `./crossref/crossref_lookup.sh --query/--doi` — discovery + citation metadata; keyless, always works (set `CROSSREF_MAILTO` for polite pool).
b. `./semantic-scholar/s2_lookup.sh` — abstracts, influential-citation counts, OA PDF links; keyed via `SEMANTIC_SCHOLAR_API_KEY` (`S2_API_KEY` alias), keyless works rate-limited. On HTTP 429 back off and retry; never skip silently.
c. `./scopus/scopus_lookup.sh` — authoritative cited-by counts; needs `SCOPUS_API_KEY`, off-campus thin views need ASU VPN or `ELSEVIER_INST_TOKEN`.
d. arXiv MCP (`arxiv_search`, `arxiv_get_metadata`, `arxiv_read_paper`) — preprints + full text; bash fallback `./arxiv/arxiv_lookup.sh --query/--id` (keyless REST).
e. OpenAlex MCP (`openalex_search_entities`, `openalex_resolve_name` before entity filters, `openalex_get_citation_graph` for forward/backward citation expansion) — citation graph + OA locations; bash fallback `./openalex/openalex_lookup.sh --query/--doi` (`OPENALEX_MAILTO` polite pool, retry on 429).
f. `./libkey/libkey_lookup.sh --doi/--pmid` — resolves ASU full text (library 158 default); needs `LIBKEY_KEY` (`LIBKEY_API_KEY` alias), keyless prints WAYFless link.
g. Paper full text — via `firecrawl-cloud` research tools when live (`FIRECRAWL_API_KEY` in env + opencode restart); self-hosted fallback: `arxiv_read_paper`, else OpenAlex `oaUrl` via `firecrawl_scrape` (single page → markdown, JS rendered), `firecrawl_crawl` + `firecrawl_check_crawl_status` (multi-page), `firecrawl_map` (URL discovery), `firecrawl_extract`/`firecrawl_parse` (structured). (`firecrawl_research_*` 404 against the self-hosted API, which has no `/research` routes — never call them on the `-mcp` instance.)
h. General web (`firecrawl_search`, then `firecrawl_agent` for gap questions) — LAST resort only, after a–g are exhausted; label Tier 3 claims `unverified-single-source`.

## Deep-research agent (isolation rule)

- `@deep-research` (`agents/deep-research.md` + `skills/deep-research/SKILL.md`) runs ONLY on explicit user request. The orchestrator and all other specialists must never delegate to it uninvited (see `oh-my-opencode-slim/orchestrator_append.md`); routine research belongs to `@librarian` / `@explorer`.
- Its workspace is `~/Documents/deep-research/<topic-slug>/` (scaffold via `deep-research/init-topic.sh`); nothing is written outside that folder.

## Rules

- Credentials come ONLY from env vars; never ask the user to paste keys into chat, never print them.
- Surface retraction / expression-of-concern alerts from lookup output; never bypass them.
- Save PDFs to disk ONLY when flagged `openAccess: true`; otherwise link, don't fetch.
- Rank multiple hits by influential citations + recency + OA availability.

## Invocation

- Run the scripts via the bash tool from `~/.config/opencode/`, e.g. `./crossref/crossref_lookup.sh --query "..."`.
- Scripts are executable and exit 0 with fallback notes on any failure — a fallback note is a result, not an error.
