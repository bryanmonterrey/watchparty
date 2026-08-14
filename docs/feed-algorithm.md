# The watchparty feed algorithm (Phoenix / x-algorithm)

watchparty's content ranking — the For You feed, the homepage carousels
(hero / Trending / Categories), and Shorts — is powered by **X's open-source
recommendation algorithm**, [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm)
(the "Phoenix" model: a two-tower retrieval model + a Grok-1-derived ranking
transformer). This is the actual algorithm, run faithfully on watchparty's stack
and data — not a heuristic imitation.

This doc is the high-level map. Deeper detail lives in:
- `docs/feed-ranker-phoenix.md` — verified model I/O schema + serving details.
- `services/phoenix/README.md` — the Cloud Run service + deploy runbook.
- `services/phoenix/training/README.md` — the training pipeline.

---

## How it works (end to end)

```
user opens feed
      │
      ▼
feed.getFeed / getVideoFeed / getShortsFeed   (server/routers/feed.ts)
      │   if FEED_RANKER_ENABLED && logged-in user:
      ├─ assemble user history from feed_signals        (lib/feed-ranker/history.ts)
      ├─ source candidates:
      │     • in-network / recent  (SQL over posts + follows)
      │     • out-of-network        (lib/feed-ranker/retrieval.ts → pgvector ANN)
      ├─ rank candidates            (lib/feed-ranker/rank-feed.ts → Phoenix /rank)
      ├─ crypto boost               (ticker ×1.15, live token ×1.30, applied post-rank)
      └─ paginate (anchor cursor "r:<anchorISO>:<offset>")
      │   on ANY failure / ranker off → reverse-chronological (null-safe)
      ▼
ranked feed
```

**Phoenix runs as a service**, not in the Worker: a FastAPI app on **GCP Cloud Run**
(the Worker can't hold a 3 GB JAX model). The watchparty edge calls it server-side,
exactly like the liteads ad service.

- `POST /rank` — transformer ranker over caller-provided candidates → per-action
  probabilities → weighted score.
- `POST /user_vector` — retrieval **user tower** → unit-norm vector to ANN-search the corpus.
- `POST /embed` — retrieval **item tower** → vectors to build the corpus.
- `GET /health` — open; `/rank` and `/embed`/`/user_vector` require the
  `x-phoenix-secret` header (the service is public but secret-guarded).

**Signals** (`feed_signals` table) log every engagement keyed to Phoenix's action
vocabulary (`1`=fav, `4`=reply, `5`=quote, `6`=repost, `11`=dwell, `13`=video-view,
`20`=negative). Emitted from like/reply/repost/video mutations + client dwell
tracking (`useFeedDwell`) + "Not interested". These feed both ranking (history) and
training (labels).

**Corpus** (`post_embeddings`, pgvector HNSW): the `feed-corpus` cron embeds recent
posts + live streams via `/embed` hourly. Out-of-network retrieval cosine-searches it.

---

## What's live (as of 2026-06-22)

| Piece | Status |
|---|---|
| Phoenix service (Cloud Run, `us-west1`, 8Gi/4CPU, min-1) | ✅ live, secret-guarded |
| Signal logging (`feed_signals`) + backfill | ✅ live |
| Ranking on For You / carousels / shorts | ✅ live (`FEED_RANKER_ENABLED=true`) |
| Corpus + out-of-network ANN retrieval | ✅ live; `feed-corpus` cron hourly :17 |
| Crypto/ticker boost | ✅ live (post-rank, tunable, no redeploy) |
| Training pipeline (ranker + retrieval two-tower) | ✅ built + verified, not yet run on real volume |
| Guarded retrain loop (`retrain.mjs`) + RCE eval gate | ✅ built + verified (rejects worse models) |
| Ranking cache (Redis, 45s) | ✅ live |
| Dwell idle-tab bug (cap + activity-gating) | ✅ fixed + live; prod rows cleaned |

Production env (`PHOENIX_API_URL`, `FEED_RANKER_ENABLED`, `PHOENIX_SHARED_SECRET`)
is in the `DOTENV_PRODUCTION` GitHub secret; deploys are push-to-main via
`.github/workflows/deploy.yml` (app + realtime + cron workers).

---

## The one hard limit

The x-algorithm release ships the model **architecture + a frozen inference
checkpoint, with NO training code**. Its embedding tables encode *X's* content,
not watchparty's — so out-of-network ANN similarity is currently weak (the
mechanism is correct; semantic quality is capped). We **built the missing training
code** (`services/phoenix/training/`), so closing this gap is now "accumulate data
→ run the trainers," not a research project. See the training README.

---

## Follow-ups / roadmap (tracked as tasks)

1. **Soak-test the hot path.** `FEED_RANKER_ENABLED=true` means every feed load makes
   Phoenix round-trips + extra DB queries (Cloud Run min-1/max-3). Watch p95 latency
   and cost under real traffic. If it pressures: flip `FEED_RANKER_ENABLED=false`
   (redeploy; everything stays wired) **or** add a cache (next item).
2. **Per-user ranking cache** (short TTL, ~30–60s) to cut repeated Phoenix calls
   during a session / pagination. Only if the soak-test shows pressure.
3. **Verify the `feed-corpus` cron** populates `post_embeddings` in prod after its
   first :17 run.
4. **Run the trainers** once `feed_signals` has real volume (thousands+ events) — the
   step that moves quality past the frozen-X ceiling.
5. **Harden the trainers** before trusting a retrained model in prod: continuous
   (dwell-magnitude) head, temporal train/val split + held-out eval (RCE), optional
   GPU embedding-table training. Port details from `../the-algorithm-ml` + `../torchrec`.

## Tuning knobs (no redeploy of watchparty needed)

- **Engagement weights + crypto boost**: the final score is a post-inference weighted
  sum (`lib/feed-ranker/rank-feed.ts` for the crypto multipliers + mutual-follow reply
  boost; the action weights live in `WEIGHTS` in `services/phoenix/service.py` — since
  2026-08-13 they follow X production's home-mixer values, incl. negative weights for
  report/not-interested). Adjust emphasis without retraining.
- **On/off**: `FEED_RANKER_ENABLED` env var.
- **Candidate pool size**: `FEED_POOL_SIZE` in `server/routers/feed.ts`.
