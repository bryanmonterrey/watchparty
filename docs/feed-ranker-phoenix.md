# Phoenix (x-algorithm) feed ranker — integration notes

X's open-source recommender (`github.com/xai-org/x-algorithm`, cloned to `../x-algorithm`) powers
watchparty's For You feed + homepage carousels. This documents the **verified** model I/O so the
Cloud Run wrapper (Phase 2) and corpus/signal work (Phase 3) build on facts, not guesses.

Phase 0 status: ✅ ran `uv run run_pipeline.py` — retrieval + ranking produce real per-action
probabilities on the bundled corpus. Mini model config (`artifacts/.../{ranker,retrieval}/config.json`):
`emb_size=128, num_layers=4, num_heads=4, key_size=32, history_seq_len=127, candidate_seq_len=64,
num_actions=19, product_surface_vocab_size=16, {user,item,author}_vocab_size=1_000_000,
num_*_hashes=2`.

## Two stages (see `phoenix/run_pipeline.py`)

1. **Retrieval (two-tower):** encode user history → unit-norm `user_repr [emb_size]`; score
   `corpus_repr @ user_repr` → top-K by dot product. Corpus = precomputed candidate representations.
2. **Ranking (transformer):** `RecsysBatch + RecsysEmbeddings` → `logits [1, cand_len, num_actions]`
   → `sigmoid` → per-action probabilities. Candidates self-isolate (can't attend to each other).

Final feed score is a **post-inference weighted sum** (NOT inside the model). **This is where we
tune weights and add the crypto boost** — no retraining needed to change ranking emphasis.
Since 2026-08-13 the blend uses **X production's home-mixer weights** (published that day in
`home-mixer/params/param.rs`; the earlier `fav*1.0 + reply*0.5 + rt*0.3 + dwell*0.2` was
run_pipeline.py's demo illustration, roughly inverted from production): fav 0.5, reply 5.0,
quote 5.0, repost 1.0, VQV/photo-expand 0.05, not-dwelled −0.02, report −234, not-interested
−43.2 — see `WEIGHTS` in `services/phoenix/service.py`. The bidirectional-follow reply boost
(+15 × P(reply), posts only) is applied edge-side in `lib/feed-ranker/rank-feed.ts`, where the
follow graph lives. Share/follow/click/block/mute weights can't apply — those actions sit past
the OSS checkpoint's 19 logit slots.

## ID handling — the critical integration detail

IDs are **numeric `uint64`** (`user_id`, `post_id`, `author_id`). They are hashed by a
linear-congruential hash (`_hash_ids`, params in `config.json["hash_params"]`) into the 1M-row
embedding tables. **watchparty IDs are `text` nanoids** → the bridge must deterministically map each
string id to a stable `uint64` (e.g. first 8 bytes of sha1) before calling the model. Same mapping
must be used for corpus building and history assembly so ids line up.

## Action schema (`feed_signals.actionType` uses these exact indices)

`1`=favorite, `4`=reply, `5`=quote, `6`=repost, `11`=dwell (value=seconds),
`13`=video-quality-view (value=fraction). 19 action slots total. History item =
`{post_id, author_id, actions:{idx:val}}`.

## `product_surface` is native (vocab 16)

`history_product_surface` / `candidate_product_surface` are model inputs (demo sets them 0). Map
watchparty surfaces (`home`/`trending`/`for-you`/`shorts`/`categories`/`stream`) to small ints so
one model ranks each section differently.

## Corpus (`sports_corpus.npz`)

Keys: `post_ids`, `candidate_representations [N, emb_size]`, `author_ids`, `topics`. Our corpus =
run the **retrieval candidate tower** over our posts + live streams → store vectors in an ANN index
(Vectorize/pgvector) instead of a full matmul. The shipped corpus is X sports posts — must be
replaced with watchparty content; shipped embeddings are X-content-specific (retrain in Phase 3).

## ⚠️ DOWN since 2026-08-09 — GCP billing account is delinquent

The whole `watchparty-ads` project is dead, not just Phoenix. The billing account
(`01DF87-69B1A8-87629E`) reads `open: false`, and Cloud Build refuses with
*"The billing account for the owning project is disabled in state delinquent."*
`gcloud billing projects describe` still says `billingEnabled: true` — that only
means the project is LINKED to the account, so it is not a health check; read
`gcloud billing accounts describe <id>` and look at `open`.

- First failure **2026-08-09T18:29Z**; 100+ billing errors since.
- Down with it: **liteads** (the ad server) and **ads-dashboard**, both 500.
- Phoenix 503s, so `rankCandidates` returns null and **every feed has been
  silently serving reverse-chronological for five days** — by design, which is
  why nothing alerted. The fallback hides the outage.
- **Nothing can deploy here until billing is settled** (a payment action).

## Serving (Phase 2) — ✅ LIVE (currently down, see above)

FastAPI on GCP Cloud Run (`services/phoenix/`), deployed and verified end-to-end.

- **URL:** `https://phoenix-979878773946.us-west1.run.app` (project `watchparty-ads`, region
  `us-west1`). Public + **shared-secret** guarded: `/rank` and `/embed` require header
  `x-phoenix-secret`; `/health` open for probes.
- **Resources:** `--memory 8Gi --cpu 4 --min-instances 1 --cpu-boost` (4Gi OOMs — two 1.4GB
  embedding tables peak ~4.5GB at load).
- **Client:** `lib/feed-ranker/server.ts` (`rankCandidates`), null-safe fallback to chronological.
  `lib/feed-ranker/ids.ts` hashes string nanoids → uint64 (verified byte-identical to the service).
- **Env (set on both sides):** `PHOENIX_API_URL`, `FEED_RANKER_ENABLED=true`, `PHOENIX_SHARED_SECRET`.
  Local: in `.env.local` (gitignored). **Production (Cloudflare): must be added to the
  `DOTENV_PRODUCTION` GitHub secret** — not yet done.
- **Deploy:** see `services/phoenix/README.md` (self-fetching build; `.gcloudignore` is critical).

## ⚠️ Upstream deleted the checkpoint (2026-08-13) — the pin is the only copy

xai-org restructured `phoenix/` that day (→ `xrex/`, `crates/`, `python/`,
`reference/`) and **removed `phoenix/artifacts/` entirely**. There is no `.npz`
or `.zip` anywhere in the tree at `main` now — only a generator script,
`reference/gen_recs_artifacts_gen.py`. The exported checkpoint this service runs
on (`oss-phoenix-artifacts.zip`) exists only in history.

So the Dockerfile is **pinned to `0bfc2795d308f90032544322747caacd535f75ae`**
(the last commit carrying it) and fetches by SHA. Building from `main` fails
twice: the flat `grok.py`/`recsys_model.py`/… it copies no longer exist at those
paths, and there is nothing to unzip. Do not "modernise" that pin.

**Back up the weights.** `../x-algorithm/phoenix/artifacts/` holds the real
2.9 GB zip plus its extracted copy (verified a genuine archive, not an LFS
pointer). That local copy and the pinned SHA are the entire supply.

## Local run (reproduce Phase 0)

```
cd ../x-algorithm/phoenix
uv sync
unzip -o artifacts/oss-phoenix-artifacts.zip -d artifacts/
uv run run_pipeline.py --artifacts_dir artifacts/oss-phoenix-artifacts
```
