# Held-out evaluation for the Phoenix ranker — the GATE that makes retraining
# safe. Scores a checkpoint on a validation JSONL using RCE (relative cross
# entropy), the metric from twitter/the-algorithm-ml metrics/rce.py:
#
#   RCE = 100 * (1 - model_bce / baseline_bce)
#
# where baseline_bce is the cross-entropy of a straw-man that always predicts the
# base rate. RCE > 0 = better than the base rate; higher = better; negative =
# worse (un-calibrated). Compare a tuned checkpoint's RCE to the published one's
# on the SAME held-out set; only promote the tuned weights if RCE improves.
#
#   uv run evaluate.py --artifacts_dir <dir> --data val.jsonl
# prints: {"rce": <float>, "mean_bce": <float>, "examples": N}

import argparse
import json
import logging
import os

import haiku as hk
import jax
import jax.numpy as jnp
import numpy as np

from recsys_model import PhoenixModelConfig, RecsysBatch, RecsysEmbeddings
from runners import load_embedding_table, load_model_params
from run_pipeline import build_hash_functions, build_model_config, build_unified_emb_table

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("jax").setLevel(logging.WARNING)
log = logging.getLogger("evaluate")
EPS = 1e-6

# Action heads we score against (the ones our signals actually populate):
# 1=fav, 4=reply, 5=quote, 6=repost, 11=dwell(binarized), 13=video-view.
SCORED_ACTIONS = [1, 4, 5, 6, 11, 13]


def _bce(p, y):
    p = np.clip(p, EPS, 1 - EPS)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts_dir", required=True, help="dir containing ranker/")
    ap.add_argument("--data", required=True, help="validation JSONL")
    args = ap.parse_args()

    with open(os.path.join(args.artifacts_dir, "ranker", "config.json")) as f:
        cfg = json.load(f)
    hist_len, cand_len, num_actions = cfg["history_seq_len"], cfg["candidate_seq_len"], cfg["num_actions"]

    params = load_model_params(os.path.join(args.artifacts_dir, "ranker", "model_params.npz"))
    emb = jnp.asarray(build_unified_emb_table(
        load_embedding_table(os.path.join(args.artifacts_dir, "ranker", "embedding_tables.npz")), cfg))
    hu, hi, ha = build_hash_functions(cfg)
    model_config = build_model_config(cfg, PhoenixModelConfig)

    def forward(batch, e):
        return model_config.make()(batch, e)
    fn = hk.without_apply_rng(hk.transform(forward))

    preds, labels = [], []  # collected over all scored (candidate, action) pairs
    examples = [json.loads(l) for l in open(args.data) if l.strip()]
    for ex in examples:
        hp = np.zeros(hist_len, dtype=np.uint64); hau = np.zeros(hist_len, dtype=np.uint64)
        hac = np.zeros((hist_len, num_actions), dtype=np.float32)
        for i, it in enumerate(ex.get("history", [])[:hist_len]):
            hp[i] = int(it["post_id"]); hau[i] = int(it.get("author_id", 0))
            for k, v in it.get("actions", {}).items():
                if 0 <= int(k) < num_actions: hac[i, int(k)] = float(v)
        cands = ex["candidates"][:cand_len]
        cs = len(cands)
        cid = np.zeros(cand_len, dtype=np.uint64); cau = np.zeros(cand_len, dtype=np.uint64)
        lab = np.zeros((cand_len, num_actions), dtype=np.float32)
        for j, c in enumerate(cands):
            cid[j] = int(c["post_id"]); cau[j] = int(c.get("author_id", 0))
            for k in c.get("actions", {}):
                if 0 <= int(k) < num_actions: lab[j, int(k)] = 1.0
        cph = hi(cid).reshape(1, cand_len, -1); cah = ha(cau).reshape(1, cand_len, -1)
        uh = hu(np.array([int(ex["user_id"])], dtype=np.uint64))
        hph = hi(hp).reshape(1, hist_len, -1); hah = ha(hau).reshape(1, hist_len, -1)
        batch = RecsysBatch(
            user_hashes=jnp.asarray(uh), history_post_hashes=jnp.asarray(hph),
            history_author_hashes=jnp.asarray(hah), history_actions=jnp.asarray(hac.reshape(1, hist_len, num_actions)),
            history_product_surface=jnp.zeros((1, hist_len), dtype=jnp.int32),
            candidate_post_hashes=jnp.asarray(cph), candidate_author_hashes=jnp.asarray(cah),
            candidate_product_surface=jnp.zeros((1, cand_len), dtype=jnp.int32),
        )
        e = RecsysEmbeddings(
            user_embeddings=emb[uh], history_post_embeddings=emb[hph],
            candidate_post_embeddings=emb[cph], history_author_embeddings=emb[hah],
            candidate_author_embeddings=emb[cah],
        )
        probs = np.asarray(jax.nn.sigmoid(fn.apply(params, batch, e).logits)[0])  # [cand, actions]
        for j in range(cs):
            for a in SCORED_ACTIONS:
                preds.append(float(probs[j, a])); labels.append(float(lab[j, a]))

    preds = np.array(preds); labels = np.array(labels)
    if len(preds) == 0:
        print(json.dumps({"rce": None, "mean_bce": None, "examples": 0, "note": "no scored pairs"}))
        return
    model_bce = _bce(preds, labels).mean()
    base = labels.mean()  # straw-man: always predict the base rate
    baseline_bce = _bce(np.full_like(labels, base), labels).mean()
    rce = float((1.0 - model_bce / (baseline_bce + EPS)) * 100)
    print(json.dumps({"rce": rce, "mean_bce": float(model_bce),
                      "baseline_bce": float(baseline_bce), "examples": len(examples),
                      "pairs": int(len(preds))}))


if __name__ == "__main__":
    main()
