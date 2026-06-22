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
2. **Training** — `train.py` (JAX/Haiku/optax): loads the checkpoint, multi-task
   **sigmoid BCE over the 19 action heads** (matches how `/rank` consumes logits),
   Adam, `value_and_grad`. Default trains the transformer only; `--train-embeddings`
   also fine-tunes the embedding table (heavy — GPU + real data volume). Exports
   tuned `model_params.npz` + `embedding_tables.npz` in the loader's format.

## Run

```sh
# 1. export (from watchparty repo)
bun scripts/feed-ranker/export-training-data.mjs > training.jsonl

# 2. train (from an x-algorithm/phoenix clone with this train.py overlaid)
uv run train.py --data training.jsonl --epochs 5 --out artifacts/tuned

# 3. assemble a full artifacts dir: tuned ranker + original retrieval/ + corpus
cp -r artifacts/oss-phoenix-artifacts/retrieval artifacts/tuned/retrieval
cp artifacts/oss-phoenix-artifacts/sports_corpus.npz artifacts/tuned/   # or your corpus

# 4. rebuild/redeploy the service pointing PHOENIX_ARTIFACTS at the tuned dir
```

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
  - Retrieval (two-tower) training is NOT implemented here — only the ranker.
    The retrieval tower stays frozen; training it needs a contrastive/in-batch-
    negatives loss (see references in the chat / the-algorithm-ml).
  - `--train-embeddings` produces dense gradients over a 3M-row table — GPU only.
