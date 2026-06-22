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

Final feed score is a **post-inference weighted sum** (NOT inside the model), demo uses:
`fav*1.0 + reply*0.5 + rt*0.3 + dwell*0.2`. **This is where we tune weights and add the crypto
boost** — no retraining needed to change ranking emphasis.

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

## Serving (Phase 2) — ✅ LIVE

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

## Local run (reproduce Phase 0)

```
cd ../x-algorithm/phoenix
uv sync
unzip -o artifacts/oss-phoenix-artifacts.zip -d artifacts/
uv run run_pipeline.py --artifacts_dir artifacts/oss-phoenix-artifacts
```
