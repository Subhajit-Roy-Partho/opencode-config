# Firecrawl (local-only, no auth)

Self-hosted [Firecrawl](https://github.com/firecrawl/firecrawl) API for local
scrape/crawl use. **No authentication, bound to 127.0.0.1 only. Never expose
to a network.**

## Version

- Source pin: `v2.11.162` (vendored in `firecrawl-src/`, `.git` removed)
- Images: official prebuilt `ghcr.io/firecrawl/{firecrawl,playwright-service,nuq-postgres}:latest`
  (no `v2.11.162` image tag exists, so `:latest` is used; digests in `VERSION`)
- See `VERSION` for exact digests. `docker-compose.yml` is adapted from
  upstream `firecrawl-src/docker-compose.yaml` with `build:` replaced by
  `image:` and the API port bound to loopback only.

## Start

```bash
cd ~/.config/opencode/firecrawl
docker compose up -d
```

First start pulls ~5 GB of images (api 2.7 GB, playwright 2 GB, postgres
639 MB, plus redis/rabbitmq).

## Verify

```bash
curl -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com"}'
```

Expect JSON containing markdown (`"markdown"` field with Example Domain text).

Queue admin UI: `http://localhost:3002/admin/CHANGEME/queues`

## Stop

```bash
cd ~/.config/opencode/firecrawl
docker compose down
```

## Ports

| Host | Service |
| ---- | ------- |
| `127.0.0.1:3002` | api (only published port) |

Internal-only (compose network): redis `6379`, rabbitmq `5672`,
nuq-postgres `5432`, playwright-service `3000`, workers `3004/3005`.

## Warning

`USE_DB_AUTHENTICATION=false` means anyone who can reach the port can scrape
through your IP. The compose file binds `127.0.0.1` only — do not change it to
`0.0.0.0` or add host port mappings for redis/postgres/rabbitmq.

## Reinstall from repo

```bash
cd ~/.config/opencode/firecrawl
docker compose up -d --build  # rebuilds nothing (all `image:`), re-pulls as needed
```

To rebuild from source instead, see `firecrawl-src/docker-compose.yaml`
(upstream `build:` directives) and `firecrawl-src/SELF_HOST.md`.
