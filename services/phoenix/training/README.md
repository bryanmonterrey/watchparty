# Phoenix ranker training (fills the gap the OSS release omits)

`xai-org/x-algorithm` ships the model *architecture* + a frozen inference
checkpoint, but **no training code** (no optimizer/loss/data pipeline). This dir
adds that, fine-tuning the published checkpoint on watchparty engagement so the
ranker learns *your* users' patterns instead of only X's.

## Pieces

1. **Data export** — `scripts/feed-ranker/export-training-data.mjs` (watchparty/bun):
   `feed_signals` + `seen_posts` → JSONL training examples
   `{user_id, history, candidates}`, candidate `actions` = label ({} = a seen
   negative). IDs hashed to uint64 (same mapping as the service). History
   excludes candidate posts (no label leakage).
2. **Ranker training** — `train.py` (JAX/Haiku/optax): loads the checkpoint, multi-task
   **sigmoid BCE over the 19 action heads** (matches how `/rank` consumes logits),
   Adam, `value_and_grad`. Default trains the transformer only; `--train-embeddings`
   also fine-tunes the embedding table (heavy — GPU + real data volume). Exports
   tuned `ranker/` weights in the loader's format.
3. **Retrieval training** — `train_retrieval.py` (the two-tower piece): fine-tunes
   the retrieval user+item towers with the **in-batch sampled-softmax** objective
   (positives on the diagonal, other items in the batch as negatives, both
   directions) — the standard two-tower loss, ported from `twitter/the-algorithm-ml`
   twhin `models.py` (`in_batch_negatives`). This is what makes the `/user_vector`
   ANN corpus search surface content the user engages with, rather than frozen-X
   semantics. Exports tuned `retrieval/` weights. Needs ≥2 engaged pairs per batch.

## The guarded loop (recommended) — one command, safe

`scripts/feed-ranker/retrain.mjs` orchestrates the whole thing with safety rails so
it can NEVER ship a worse model:

```sh
# dry run (trains + reports RCE delta, promotes nothing)
PHX=../x-algorithm/phoenix bun scripts/feed-ranker/retrain.mjs
# promote tuned weights ONLY if they beat baseline on held-out data
PHX=../x-algorithm/phoenix bun scripts/feed-ranker/retrain.mjs --promote
```

It: (1) **guards on data volume** (`RETRAIN_MIN_EXAMPLES`, default 500 — aborts on
noise); (2) exports + does a **temporal train/val split** (train on older, eval on
newer — no leakage); (3) trains both towers; (4) computes **RCE on the held-out set**
for baseline vs tuned (`evaluate.py`); (5) **promotes only if RCE improved**. A worse
model is rejected (verified: on tiny data the tuned model overfits and scores worse on
held-out → gate correctly refuses).

After `--promote` succeeds, rebuild/redeploy the service with `PHOENIX_ARTIFACTS`
pointing at the tuned dir (bake `artifacts/tuned` into the image — see
`services/phoenix/README.md`).

## Manual steps (what the loop wraps)

```sh
bun scripts/feed-ranker/export-training-data.mjs > training.jsonl   # from watchparty repo
uv run train.py           --data training.jsonl --epochs 5 --out artifacts/tuned   # ranker
uv run train_retrieval.py --data training.jsonl --epochs 5 --out artifacts/tuned   # retrieval
uv run evaluate.py --artifacts_dir artifacts/tuned --data val.jsonl   # RCE on held-out
```

`evaluate.py` reports **RCE** (relative cross entropy, the metric from
`the-algorithm-ml`): `100*(1 - model_bce/baseline_bce)` vs a base-rate straw man.
>0 = better than base rate, higher = better, negative = worse/un-calibrated. **The
published X checkpoint scores NEGATIVE RCE on watchparty data** — quantifying the
frozen-checkpoint limitation: X's model is mis-calibrated for our content until tuned.

## Honest status & limits

- **Verified:** the loop runs, loss decreases, and exported weights round-trip
  through the service loader. Proven on real (but tiny: ~5 examples) data.
- **The gate is data volume, not code.** With few signals this changes nothing
  meaningful — it proves the machinery. Real lift needs thousands+ of logged
  engagement events (Phase 1 logging accumulates these over time).
- **Scaffold caveats to harden before production training:**
  - Only the binary action-occurrence loss is implemented; the continuous head
    (`continuous_preds`, e.g. dwell magnitude) is not yet trained.
  - No temporal train/val split or held-out evaluation — add before trusting it.
  - `--train-embeddings` produces dense gradients over a 3M-row table — GPU only.
  - Reference: `twitter/the-algorithm-ml` (recap = ranker multi-task BCE; twhin =
    in-batch-negatives embedding training) and `pytorch/torchrec` (two-tower/DLRM
    at scale) — both cloned alongside for porting production-grade details.
