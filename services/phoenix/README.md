# Phoenix feed-ranker service (Cloud Run)

The ML ranking service behind watchparty's For You feed + homepage carousels.
Wraps X's open-source Phoenix model (`github.com/xai-org/x-algorithm`) — two-tower
retrieval + Grok-1-derived transformer ranker — in a FastAPI app on GCP Cloud Run.
Mirrors the liteads (openadserver) deployment pattern; called server-side from
`lib/feed-ranker/server.ts`. See `docs/feed-ranker-phoenix.md` for model I/O.

## Self-fetching build (no multi-GB upload)

The model code + 3 GB weights are NOT vendored here and are NOT uploaded from a
dev box. The Dockerfile clones `xai-org/x-algorithm` and `git lfs pull`s the
weights DURING the build — Cloud Build runs in-datacenter, so the 3 GB fetch is
fast, and the build context is just `service.py` (a few KB). This avoids the
home-uplink bottleneck (uploading 2.9 GB as build context took 20+ min and
stalled).

```sh
# Build context = this dir; only service.py + Dockerfile are sent (.dockerignore
# excludes everything else). The image is built entirely from GitHub-fetched code.
cd services/phoenix
gcloud builds submit --config cloudbuild.yaml --project watchparty-ads

# Deploy to Cloud Run (4Gi for the ~3 GB model; warm instance to avoid cold starts)
gcloud run deploy phoenix \
  --image us-west1-docker.pkg.dev/watchparty-ads/phoenix/phoenix:latest \
  --region us-west1 --project watchparty-ads \
  --memory 4Gi --cpu 2 --concurrency 8 --min-instances 1 --timeout 30 \
  --allow-unauthenticated
```

`cloudbuild.yaml` here builds with context `.` — when building from a clone's
`phoenix/` dir instead, the same files apply (service.py is the only input).

Then set `PHOENIX_API_URL` (the Cloud Run URL) + `FEED_RANKER_ENABLED=true` in
the watchparty env.

## Endpoints (`service.py`)

- `GET  /health` — liveness + whether models are loaded.
- `POST /rank` — transformer ranker over caller-provided candidates. Body:
  `{user_id, history:[{post_id,author_id,actions}], candidates:[{ref,id,author_id,product_surface}]}`.
  Returns `{ranked:[{ref,score,actions}]}` sorted desc. `ref` is watchparty's
  opaque string id, echoed back untouched; `id` is the uint64 from
  `lib/feed-ranker/ids.ts`. **Candidate sourcing happens on the watchparty
  side** (follows + corpus ANN) — this endpoint only ranks.
- `POST /embed` — item-tower candidate representations (128-dim) for building
  the retrieval corpus (Phase 3). Body `{items:[{ref,id,author_id,product_surface}]}`.

## Notes

- CPU-only JAX (Cloud Run has no GPU); the mini model runs fine on CPU.
- `min-instances 1` keeps a warm instance (3 GB model → slow cold start).
- Engagement weights + crypto boost are applied **watchparty-side** after
  ranking (the score is a post-inference weighted sum); changing emphasis needs
  no redeploy.
