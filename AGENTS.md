# AGENTS.md — global agent instructions (`~/.config/opencode/`)

Agents: read this file for tool-routing policy before doing research.
Human details live in `README.md`; this file is the routing rule.

## Web pages

- Try `firecrawl-mcp_*` tools first (local Docker, `FIRECRAWL_API_URL=http://localhost:3002`, `timeout: 30000` for cold starts).
- On connection/timeout failure, fall back to built-in `webfetch`/`websearch`; never treat the fallback as an error.

## Scientific articles (in this order)

a. `./crossref/crossref_lookup.sh --query/--doi` — discovery + citation metadata; keyless, always works (set `CROSSREF_MAILTO` for polite pool).
b. `./semantic-scholar/s2_lookup.sh` — abstracts, influential-citation counts, OA PDF links; keyed via `SEMANTIC_SCHOLAR_API_KEY` (`S2_API_KEY` alias), keyless works rate-limited.
c. `./scopus/scopus_lookup.sh` — authoritative cited-by counts; needs `SCOPUS_API_KEY`, off-campus thin views need ASU VPN or `ELSEVIER_INST_TOKEN`.
d. `./libkey/libkey_lookup.sh --doi/--pmid` — resolves ASU full text (library 158 default); needs `LIBKEY_KEY` (`LIBKEY_API_KEY` alias), keyless prints WAYFless link.
e. Firecrawl scrape — any article/landing page needing JS rendering.

## Rules

- Credentials come ONLY from env vars; never ask the user to paste keys into chat, never print them.
- Surface retraction / expression-of-concern alerts from lookup output; never bypass them.
- Save PDFs to disk ONLY when flagged `openAccess: true`; otherwise link, don't fetch.
- Rank multiple hits by influential citations + recency + OA availability.

## Invocation

- Run the scripts via the bash tool from `~/.config/opencode/`, e.g. `./crossref/crossref_lookup.sh --query "..."`.
- Scripts are executable and exit 0 with fallback notes on any failure — a fallback note is a result, not an error.
