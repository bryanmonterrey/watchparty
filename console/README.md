# watchparty console

The developer console app — X-Developer-Console-style dashboard, destined for
`console.watchparty.xyz`. **The complete blueprint (page anatomy from the X
reference, watchparty data mapping, build order, deploy shape) lives in
`docs/console-plan.md` — build from that.**

Scaffolded 2026-08-09 from square-ui `templates-baseui`
(zerostaticthemes/square-ui — Next 16, React 19, Tailwind 4, Base UI,
HugeIcons; license permits commercial end products, no redistribution — this
repo is private). Still mock-data-driven: nothing is wired to watchparty yet.

- `bun install && bun run dev` → http://localhost:3002 (3001 is the main app)
- Own tsconfig; excluded from the root tsc like `mobile/` and `cron/`.
- Harness contract when wiring begins: **type-only** imports from
  `@/server/routers` (the `mobile/` rule — never value imports), auth via the
  shared cross-subdomain session cookie, API same-origin via a zone route of
  `console.watchparty.xyz/api/*` to the main worker.
- Until this app deploys, `console.watchparty.xyz` serves the interim
  `(developer)` portal from the main worker.
