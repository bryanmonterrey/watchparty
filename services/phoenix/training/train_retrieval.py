# Retrieval (two-tower) training for Phoenix — the piece deliberately left out of
# the first ranker trainer. Fine-tunes the retrieval user+item towers so the
# user-vector ANN search (corpus retrieval / out-of-network discovery) surfaces
# content the user actually engages with, instead of frozen-X-semantics noise.
#
# Loss = in-batch sampled softmax (the standard two-tower objective), ported from
# twitter/the-algorithm-ml twhin models.py (in_batch_negatives via dot products):
#   - user_repr_i · item_repr_i  = positive (diagonal)
#   - user_repr_i · item_repr_j  = negatives (off-diagonal, other items in batch)
#   - softmax cross-entropy with the diagonal as the label, both directions.
#
#   uv run train_retrieval.py --data training.jsonl --epochs 5 --out artifacts/tuned
#
# Trains the retrieval transform params (+ log_temperature); embeddings frozen by
# default (--train-embeddings for the heavy variant). Exports retrieval/ weights
# in the loader's format. Same data-volume caveat as train.py.

import argparse
import json
import logging
import os

import haiku as hk
import jax
import jax.numpy as jnp
import numpy as np
import optax

from recsys_model import RecsysBatch, RecsysEmbeddings
from recsys_retrieval_model import PhoenixRetrievalModelConfig
from runners import load_embedding_table, load_model_params
from run_pipeline import build_hash_functions, build_model_config, build_unified_emb_table

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("jax").setLevel(logging.WARNING)
log = logging.getLogger("train-retrieval")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts_dir", default="./artifacts/oss-phoenix-artifacts")
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="./artifacts/tuned")
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--train-embeddings", action="store_true")
    args = ap.parse_args()

    with open(os.path.join(args.artifacts_dir, "retrieval", "config.json")) as f:
        cfg = json.load(f)
    hist_len, cand_len, num_actions = cfg["history_seq_len"], cfg["candidate_seq_len"], cfg["num_actions"]

    params = load_model_params(os.path.join(args.artifacts_dir, "retrieval", "model_params.npz"))
    emb_table = jnp.asarray(build_unified_emb_table(
        load_embedding_table(os.path.join(args.artifacts_dir, "retrieval", "embedding_tables.npz")), cfg))
    hu, hi, ha = build_hash_functions(cfg)
    model_config = build_model_config(cfg, PhoenixRetrievalModelConfig)

    # One transform returning (user_repr, positive_item_repr). The item repr is
    # the candidate at index 0 (the user's engaged post).
    def forward(batch, emb):
        model = model_config.make()
        user_repr, _ = model.build_user_representation(batch, emb)
        cand_repr, _ = model.build_candidate_representation(batch, emb)
        _ = hk.get_parameter("log_temperature", [], init=hk.initializers.Constant(0.0))
        return user_repr, cand_repr[:, 0, :]
    fn = hk.without_apply_rng(hk.transform(forward))

    # Build per-example tensors: user history + ONE positive candidate (an engaged post).
    examples = [json.loads(l) for l in open(args.data) if l.strip()]
    built = []
    for ex in examples:
        pos = next((c for c in ex["candidates"] if c.get("actions")), None)
        if pos is None:
            continue
        h = ex.get("history", [])
        hp = np.zeros(hist_len, dtype=np.uint64); hau = np.zeros(hist_len, dtype=np.uint64)
        hac = np.zeros((hist_len, num_actions), dtype=np.float32)
        for i, it in enumerate(h[:hist_len]):
            hp[i] = int(it["post_id"]); hau[i] = int(it.get("author_id", 0))
            for k, v in it.get("actions", {}).items():
                if 0 <= int(k) < num_actions: hac[i, int(k)] = float(v)
        cp = np.zeros(cand_len, dtype=np.uint64); ca = np.zeros(cand_len, dtype=np.uint64)
        cp[0] = int(pos["post_id"]); ca[0] = int(pos.get("author_id", 0))
        built.append({
            "user_h": hu(np.array([int(ex["user_id"])], dtype=np.uint64)),
            "hp": hi(hp).reshape(1, hist_len, -1), "hau": ha(hau).reshape(1, hist_len, -1),
            "hac": hac.reshape(1, hist_len, num_actions),
            "cp": hi(cp).reshape(1, cand_len, -1), "ca": ha(ca).reshape(1, cand_len, -1),
        })
    log.info("retrieval training pairs: %d", len(built))
    if len(built) < 2:
        log.warning("need >=2 pairs for in-batch negatives; got %d. Exporting unchanged.", len(built))

    def reprs(params, table, b):
        batch = RecsysBatch(
            user_hashes=jnp.asarray(b["user_h"]),
            history_post_hashes=jnp.asarray(b["hp"]), history_author_hashes=jnp.asarray(b["hau"]),
            history_actions=jnp.asarray(b["hac"]),
            history_product_surface=jnp.zeros((1, hist_len), dtype=jnp.int32),
            candidate_post_hashes=jnp.asarray(b["cp"]), candidate_author_hashes=jnp.asarray(b["ca"]),
            candidate_product_surface=jnp.zeros((1, cand_len), dtype=jnp.int32),
        )
        emb = RecsysEmbeddings(
            user_embeddings=table[b["user_h"]], history_post_embeddings=table[b["hp"]],
            candidate_post_embeddings=table[b["cp"]], history_author_embeddings=table[b["hau"]],
            candidate_author_embeddings=table[b["ca"]],
        )
        u, it = fn.apply(params, batch, emb)
        return u[0], it[0]  # [D], [D]

    def loss_on(params, table):
        us = jnp.stack([reprs(params, table, b)[0] for b in built])   # [B, D]
        its = jnp.stack([reprs(params, table, b)[1] for b in built])  # [B, D]
        us = us / (jnp.linalg.norm(us, axis=-1, keepdims=True) + 1e-8)
        its = its / (jnp.linalg.norm(its, axis=-1, keepdims=True) + 1e-8)
        logits = us @ its.T  # [B, B]; diagonal = positives, off-diag = in-batch negatives
        labels = jnp.arange(us.shape[0])
        # both directions (user->item and item->user), like the twin-tower objective
        l1 = optax.softmax_cross_entropy_with_integer_labels(logits, labels)
        l2 = optax.softmax_cross_entropy_with_integer_labels(logits.T, labels)
        return (l1.mean() + l2.mean()) / 2

    if len(built) >= 2:
        opt = optax.adam(args.lr)
        if args.train_embeddings:
            state = opt.init((params, emb_table))
            lg = jax.value_and_grad(loss_on, argnums=(0, 1))
            for ep in range(args.epochs):
                l, (pg, tg) = lg(params, emb_table)
                upd, state = opt.update((pg, tg), state)
                params, emb_table = optax.apply_updates((params, emb_table), upd)
                log.info("epoch %d  loss=%.5f", ep + 1, float(l))
        else:
            state = opt.init(params)
            lg = jax.value_and_grad(loss_on, argnums=0)
            for ep in range(args.epochs):
                l, g = lg(params, emb_table)
                upd, state = opt.update(g, state)
                params = optax.apply_updates(params, upd)
                log.info("epoch %d  loss=%.5f", ep + 1, float(l))

    os.makedirs(os.path.join(args.out, "retrieval"), exist_ok=True)
    flat = {f"{m}/{n}": np.asarray(v) for m, n, v in hk.data_structures.traverse(params)}
    np.savez(os.path.join(args.out, "retrieval", "model_params.npz"), **flat)
    pad, uv, iv, av = 65, cfg["user_vocab_size"], cfg["item_vocab_size"], cfg["author_vocab_size"]
    t = np.asarray(emb_table)
    np.savez(os.path.join(args.out, "retrieval", "embedding_tables.npz"),
             user_embeddings=t[pad:pad + uv], item_embeddings=t[pad + uv:pad + uv + iv],
             author_embeddings=t[pad + uv + iv:pad + uv + iv + av])
    with open(os.path.join(args.out, "retrieval", "config.json"), "w") as f:
        json.dump(cfg, f)
    log.info("exported tuned retrieval -> %s/retrieval", args.out)


if __name__ == "__main__":
    main()
