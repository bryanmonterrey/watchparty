# The Next app as a container image, for Cloudflare Containers.
#
# Why this exists: the same app compiled to a single Worker is 41 MB (9.2 of
# the 10 MiB gzip ceiling) and gets killed at the 128 MB per-isolate memory
# limit. Here it runs as an ordinary Node server with 4 GiB, and neither limit
# applies. The Worker in ../src/index.ts is now just a door onto this.
#
# Built by CI, never locally — same reason the Worker is (see deploy.yml).
# linux/amd64 is required by Cloudflare Containers.

# ── deps ────────────────────────────────────────────────────────────────────
# Base images from registries without Docker Hub's anonymous-pull limit:
# GitHub's shared runners hit 429 on docker.io on 2026-10-09 (two runs in a
# row). ghcr.io/oven-sh/bun is Bun's own publish; public.ecr.aws mirrors the
# official Node image.
FROM --platform=linux/amd64 ghcr.io/oven-sh/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── build ───────────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Turns on `output: "standalone"` in next.config.ts. Without it Next builds for
# the Worker packaging instead and there is no server.js to run.
ENV BUILD_TARGET=container

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# .env has to be readable HERE — CI restores it from DOTENV_PRODUCTION before
# the build, and `next build` picks it up on its own.
#
# It only ever exists in this stage. The runtime stage below starts from a
# clean base and copies just the built output, so no env file is in the shipped
# image. (A build secret would be tidier still, but wrangler's image build has
# no way to pass one.) Everything the server needs at RUNTIME arrives from the
# Worker instead — see envVars in ../src/index.ts.
RUN NODE_OPTIONS=--max-old-space-size=6144 npx next build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Tells db/index.ts it's serving HTTP inside the container, so it picks the
# per-request DB client (the wedge-proof Workers strategy) instead of the
# process-global pool — whose silently-dead Supavisor sockets hung every tRPC
# query on the 2026-08-06 cut-over attempt. Runtime stage only: build-time
# code (next build) still wants the global client.
ENV WATCHPARTY_CONTAINER=1

# `standalone` ships its own minimal node_modules — the 41 MB problem doesn't
# follow us here, but there's no reason to carry the full tree either.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
