# Phoenix feed-ranker service (Cloud Run)

The ML ranking service behind watchparty's For You feed + homepage carousels.
Wraps X's open-source Phoenix model (`github.com/xai-org/x-algorithm`) — two-tower
retrieval + Grok-1-derived transformer ranker — in a FastAPI app on GCP Cloud Run.
Mirrors the liteads (openadserver) deployment pattern; called server-side from
`lib/feed-ranker/server.ts`. See `docs/feed-ranker-phoenix.md` for model I/O.

## These files are an overlay on the x-algorithm clone

The model code + 3 GB artifacts are NOT vendored here (too large; Apache-2.0,
Grok-1-derived — keep at the source). The files in this dir are copied INTO a
local clone of the repo to build/deploy:

```sh
# 1. clone + pull the model weights (~3 GB LFS), unzip artifacts
git clone https://github.com/xai-org/x-algorithm.git ../x-algorithm
cd ../x-algorithm/phoenix
git lfs pull
unzip -o artifacts/oss-phoenix-artifacts.zip -d artifacts/

# 2. overlay these service files
cp <watchparty>/services/phoenix/{service.py,Dockerfile,cloudbuild.yaml,.dockerignore} .

# 3. build the image (uploads ~2.9 GB context, bakes artifacts into the image)
gcloud builds submit --config cloudbuild.yaml --project watchparty-ads

# 4. deploy to Cloud Run
gcloud run deploy phoenix \
  --image us-west1-docker.pkg.dev/watchparty-ads/phoenix/phoenix:latest \
  --region us-west1 --project watchparty-ads \
  --memory 4Gi --cpu 2 --concurrency 8 --min-instances 1 --timeout 30 \
  --allow-unauthenticated
```

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
