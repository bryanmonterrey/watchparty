# rpc-proxy prototype (Elysia + Bun)

Prototype of `app/api/rpc/route.ts` as a standalone Bun microservice, built to
benchmark Elysia against the Next.js route and to keep in
`docs/TODO.md` ("Elysia Bun microservice for hot stateless endpoints") as the
starting point if the rpc proxy / Helius webhooks / UDF feeds ever get carved
out. Same cacheable-method allowlist and cache semantics as the Next route.

## Run

```bash
bun install

# against real Helius (needs HELIUS_API_KEY; CACHE_DRIVER=memory|upstash|off)
HELIUS_API_KEY=... bun run start

# against the local mock upstream (no secrets needed)
bun run mock &                       # :3999, MOCK_DELAY_MS=50
UPSTREAM_RPC_URL=http://localhost:3999 bun run start

bun run bench.ts http://localhost:3002/rpc 200 20
```

The in-process `memory` driver is the co-located advantage a long-lived Bun
process has over per-isolate Workers code: cache hits skip the Upstash REST
round trip entirely.
