# Training loop for the Phoenix ranker — the piece the open-source release omits
# (it ships inference + a frozen checkpoint, no optimizer/loss/data pipeline).
#
# Starts from the published checkpoint and FINE-TUNES on watchparty engagement:
# each training example is {user_id, history, candidates} where a candidate's
# `actions` is the label (which engagement occurred; {} = a seen negative).
# Loss = sigmoid binary cross-entropy over the 19 action heads (matching how
# /rank consumes logits: sigmoid -> P(action)). By default only the transformer
# params train; --train-embeddings also fine-tunes the embedding table (heavier).
#
#   uv run train.py --data training.jsonl --epochs 5 --out artifacts/tuned
#
# Then point the service at the new artifacts dir (PHOENIX_ARTIFACTS) and redeploy.
# NOTE: meaningful gains require real data volume — with few signals this proves
# the loop runs and exports loadable weights, not that quality improves.

import argparse
import json
import logging
import os

import haiku as hk
import jax
import jax.numpy as jnp
import numpy as np
import optax

from recsys_model import PhoenixModelConfig, RecsysBatch, RecsysEmbeddings
from runners import load_embedding_table, load_model_params
from run_pipeline import build_hash_functions, build_model_config, build_unified_emb_table

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("jax").setLevel(logging.WARNING)
log = logging.getLogger("train")


def history_arrays(history, hist_len, num_actions):
    post = np.zeros(hist_len, dtype=np.uint64)
    auth = np.zeros(hist_len, dtype=np.uint64)
    act = np.zeros((hist_len, num_actions), dtype=np.float32)
    for i, it in enumerate(history[:hist_len]):
        post[i] = int(it["post_id"])
        auth[i] = int(it.get("author_id", 0))
        for k, v in it.get("actions", {}).items():
            if 0 <= int(k) < num_actions:
                act[i, int(k)] = float(v)
    return post, auth, act


def build_example(ex, cfg, hashers):
    """One example -> (RecsysBatch tensors, labels, mask, hash index arrays)."""
    hist_len, cand_len, num_actions = cfg["history_seq_len"], cfg["candidate_seq_len"], cfg["num_actions"]
    hu, hi, ha = hashers
    h_post, h_auth, h_act = history_arrays(ex.get("history", []), hist_len, num_actions)

    user_h = hu(np.array([int(ex["user_id"])], dtype=np.uint64))
    hist_post_h = hi(h_post).reshape(1, hist_len, -1)
    hist_auth_h = ha(h_auth).reshape(1, hist_len, -1)

    cands = ex["candidates"][:cand_len]
    cs = len(cands)
    cand_ids = np.zeros(cand_len, dtype=np.uint64)
    cand_auth = np.zeros(cand_len, dtype=np.uint64)
    labels = np.zeros((cand_len, num_actions), dtype=np.float32)
    mask = np.zeros(cand_len, dtype=np.float32)
    for j, c in enumerate(cands):
        cand_ids[j] = int(c["post_id"])
        cand_auth[j] = int(c.get("author_id", 0))
        mask[j] = 1.0
        for k, v in c.get("actions", {}).items():
            if 0 <= int(k) < num_actions:
                labels[j, int(k)] = 1.0  # binary: action occurred
    cph = hi(cand_ids).reshape(1, cand_len, -1)
    cah = ha(cand_auth).reshape(1, cand_len, -1)
    return {
        "user_h": user_h, "hist_post_h": hist_post_h, "hist_auth_h": hist_auth_h,
        "hist_act": h_act.reshape(1, hist_len, num_actions),
        "cph": cph, "cah": cah,
        "labels": labels.reshape(1, cand_len, num_actions),
        "mask": mask.reshape(1, cand_len),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts_dir", default="./artifacts/oss-phoenix-artifacts")
    ap.add_argument("--data", required=True, help="training JSONL")
    ap.add_argument("--out", default="./artifacts/tuned")
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--train-embeddings", action="store_true",
                    help="also fine-tune the embedding table (heavy; needs GPU + data)")
    args = ap.parse_args()

    with open(os.path.join(args.artifacts_dir, "ranker", "config.json")) as f:
        cfg = json.load(f)
    num_actions, hist_len, cand_len = cfg["num_actions"], cfg["history_seq_len"], cfg["candidate_seq_len"]

    params = load_model_params(os.path.join(args.artifacts_dir, "ranker", "model_params.npz"))
    emb_dict = load_embedding_table(os.path.join(args.artifacts_dir, "ranker", "embedding_tables.npz"))
    emb_table = jnp.asarray(build_unified_emb_table(emb_dict, cfg))
    hashers = build_hash_functions(cfg)
    model_config = build_model_config(cfg, PhoenixModelConfig)

    def forward(batch, emb):
        return model_config.make()(batch, emb)
    rank_fn = hk.without_apply_rng(hk.transform(forward))

    examples = [json.loads(l) for l in open(args.data) if l.strip()]
    log.info("loaded %d training examples", len(examples))
    batches = [build_example(ex, cfg, hashers) for ex in examples]

    def gather(table, b):
        return RecsysEmbeddings(
            user_embeddings=table[b["user_h"]],
            history_post_embeddings=table[b["hist_post_h"]],
            candidate_post_embeddings=table[b["cph"]],
            history_author_embeddings=table[b["hist_auth_h"]],
            candidate_author_embeddings=table[b["cah"]],
        )

    def make_batch(b):
        return RecsysBatch(
            user_hashes=jnp.asarray(b["user_h"]),
            history_post_hashes=jnp.asarray(b["hist_post_h"]),
            history_author_hashes=jnp.asarray(b["hist_auth_h"]),
            history_actions=jnp.asarray(b["hist_act"]),
            history_product_surface=jnp.zeros((1, hist_len), dtype=jnp.int32),
            candidate_post_hashes=jnp.asarray(b["cph"]),
            candidate_author_hashes=jnp.asarray(b["cah"]),
            candidate_product_surface=jnp.zeros((1, cand_len), dtype=jnp.int32),
        )

    def loss_on(params, table, b):
        out = rank_fn.apply(params, make_batch(b), gather(table, b))
        labels = jnp.asarray(b["labels"])
        mask = jnp.asarray(b["mask"])[..., None]  # [1,cand,1]
        bce = optax.sigmoid_binary_cross_entropy(out.logits, labels) * mask
        return bce.sum() / (mask.sum() * num_actions + 1e-8)

    train_emb = args.train_embeddings
    opt = optax.adam(args.lr)
    if train_emb:
        state = opt.init((params, emb_table))
        loss_and_grad = jax.value_and_grad(loss_on, argnums=(0, 1))
    else:
        state = opt.init(params)
        loss_and_grad = jax.value_and_grad(loss_on, argnums=0)

    for epoch in range(args.epochs):
        total = 0.0
        for b in batches:
            if train_emb:
                l, (pg, tg) = loss_and_grad(params, emb_table, b)
                updates, state = opt.update((pg, tg), state)
                params, emb_table = optax.apply_updates((params, emb_table), updates)
            else:
                l, g = loss_and_grad(params, emb_table, b)
                updates, state = opt.update(g, state)
                params = optax.apply_updates(params, updates)
            total += float(l)
        log.info("epoch %d  mean_loss=%.5f", epoch + 1, total / max(len(batches), 1))

    # ── Export in the loader's format ────────────────────────────────────────
    os.makedirs(os.path.join(args.out, "ranker"), exist_ok=True)
    flat = {}
    for module, name, val in hk.data_structures.traverse(params):
        flat[f"{module}/{name}"] = np.asarray(val)
    np.savez(os.path.join(args.out, "ranker", "model_params.npz"), **flat)

    pad, uv, iv, av = 65, cfg["user_vocab_size"], cfg["item_vocab_size"], cfg["author_vocab_size"]
    t = np.asarray(emb_table)
    np.savez(
        os.path.join(args.out, "ranker", "embedding_tables.npz"),
        user_embeddings=t[pad:pad + uv],
        item_embeddings=t[pad + uv:pad + uv + iv],
        author_embeddings=t[pad + uv + iv:pad + uv + iv + av],
    )
    with open(os.path.join(args.out, "ranker", "config.json"), "w") as f:
        json.dump(cfg, f)
    log.info("exported tuned ranker -> %s/ranker (copy retrieval/ + corpus to use)", args.out)


if __name__ == "__main__":
    main()
