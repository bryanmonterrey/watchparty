# FastAPI wrapper around the Phoenix retrieval + ranking models, for serving
# watchparty's feed from GCP Cloud Run. Mirrors the liteads (openadserver)
# deployment pattern: load the heavy model once at startup, expose cheap HTTP
# endpoints, let the watchparty edge call it server-side.
#
#   /health      liveness + whether models are loaded
#   /rank        transformer ranker over caller-provided candidates
#   /embed       item-tower candidate representations (for corpus building)
#
# Candidates carry an opaque `ref` (watchparty's string post/stream id) passed
# straight through to the response, plus a numeric `id` (uint64, hashed from the
# string on the watchparty side) that the model actually consumes — so neither
# side has to reverse the hash.
#
# Run locally:  uv run uvicorn service:app --host 0.0.0.0 --port 8080
# Artifacts dir via env PHOENIX_ARTIFACTS (default ./artifacts/oss-phoenix-artifacts).

import json
import logging
import os
from contextlib import asynccontextmanager

import haiku as hk
import jax
import jax.numpy as jnp
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field

from grok import TransformerConfig
from recsys_model import HashConfig, PhoenixModelConfig, RecsysBatch, RecsysEmbeddings
from recsys_retrieval_model import PhoenixRetrievalModelConfig
from runners import load_embedding_table, load_model_params

# Reuse the exact loading/hashing helpers the reference pipeline uses.
from run_pipeline import build_hash_functions, build_model_config, build_unified_emb_table

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logging.getLogger("jax").setLevel(logging.WARNING)
log = logging.getLogger("phoenix-service")

ARTIFACTS = os.environ.get("PHOENIX_ARTIFACTS", "./artifacts/oss-phoenix-artifacts")

# Default engagement weights (watchparty re-weights + adds crypto boost on its
# side; these are a sensible fallback matching the reference demo).
IDX_FAV, IDX_REPLY, IDX_RT, IDX_DWELL = 1, 4, 6, 11

STATE: dict = {}


def _load():
    """Load both models + embedding tables once. ~3 GB RAM."""
    with open(os.path.join(ARTIFACTS, "retrieval", "config.json")) as f:
        ret_cfg = json.load(f)
    with open(os.path.join(ARTIFACTS, "ranker", "config.json")) as f:
        rank_cfg = json.load(f)

    log.info("Loading ranker model...")
    rank_params = load_model_params(os.path.join(ARTIFACTS, "ranker", "model_params.npz"))
    rank_emb = build_unified_emb_table(
        load_embedding_table(os.path.join(ARTIFACTS, "ranker", "embedding_tables.npz")), rank_cfg
    )
    rank_hash_user, rank_hash_item, rank_hash_author = build_hash_functions(rank_cfg)
    rank_model_config = build_model_config(rank_cfg, PhoenixModelConfig)

    def rank_forward(b, e):
        return rank_model_config.make()(b, e)

    rank_fn = hk.without_apply_rng(hk.transform(rank_forward))

    log.info("Loading retrieval (item tower) model...")
    ret_params = load_model_params(os.path.join(ARTIFACTS, "retrieval", "model_params.npz"))
    ret_emb = build_unified_emb_table(
        load_embedding_table(os.path.join(ARTIFACTS, "retrieval", "embedding_tables.npz")), ret_cfg
    )
    ret_hash_user, ret_hash_item, ret_hash_author = build_hash_functions(ret_cfg)

    STATE.update(
        ret_cfg=ret_cfg,
        rank_cfg=rank_cfg,
        rank_params=rank_params,
        rank_emb=rank_emb,
        rank_hash_user=rank_hash_user,
        rank_hash_item=rank_hash_item,
        rank_hash_author=rank_hash_author,
        rank_fn=rank_fn,
        ret_params=ret_params,
        ret_emb=ret_emb,
        ret_hash_item=ret_hash_item,
        ret_hash_author=ret_hash_author,
        emb_size=rank_cfg["emb_size"],
        num_actions=rank_cfg["num_actions"],
        hist_len=rank_cfg["history_seq_len"],
        cand_len=rank_cfg["candidate_seq_len"],
    )
    log.info("Models loaded (emb_size=%d, num_actions=%d).", STATE["emb_size"], STATE["num_actions"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    _load()
    yield
    STATE.clear()


app = FastAPI(title="Phoenix feed ranker", lifespan=lifespan)


# ── Schemas ──────────────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    post_id: int
    author_id: int = 0
    actions: dict[int, float] = Field(default_factory=dict)


class RankCandidate(BaseModel):
    ref: str                 # watchparty's opaque id, echoed back untouched
    id: int                  # uint64 the model consumes
    author_id: int = 0
    product_surface: int = 0


class RankRequest(BaseModel):
    user_id: int
    history: list[HistoryItem] = Field(default_factory=list)
    candidates: list[RankCandidate]


class EmbedItem(BaseModel):
    ref: str
    id: int
    author_id: int = 0
    product_surface: int = 0


class EmbedRequest(BaseModel):
    items: list[EmbedItem]


# ── History → model tensors (shared by /rank) ─────────────────────────────────

def _history_arrays(history: list[HistoryItem]):
    hist_len = STATE["hist_len"]
    num_actions = STATE["num_actions"]
    post_ids = np.zeros(hist_len, dtype=np.uint64)
    author_ids = np.zeros(hist_len, dtype=np.uint64)
    actions = np.zeros((hist_len, num_actions), dtype=np.float32)
    for i, item in enumerate(history[:hist_len]):
        post_ids[i] = item.post_id
        author_ids[i] = item.author_id
        for idx, val in item.actions.items():
            if 0 <= int(idx) < num_actions:
                actions[i, int(idx)] = float(val)
    return post_ids, author_ids, actions


@app.get("/health")
def health():
    return {"ok": True, "models_loaded": bool(STATE), "artifacts": ARTIFACTS}


@app.post("/rank")
def rank(req: RankRequest):
    if not req.candidates:
        return {"ranked": []}

    hist_len, cand_len, num_actions = STATE["hist_len"], STATE["cand_len"], STATE["num_actions"]
    rank_emb = STATE["rank_emb"]
    h_post, h_author, h_actions = _history_arrays(req.history)

    user_h = STATE["rank_hash_user"](np.array([req.user_id], dtype=np.uint64))
    hist_post_h = STATE["rank_hash_item"](h_post).reshape(1, hist_len, -1)
    hist_author_h = STATE["rank_hash_author"](h_author).reshape(1, hist_len, -1)
    hist_actions = jnp.asarray(h_actions.reshape(1, hist_len, num_actions))
    hist_surface = jnp.zeros((1, hist_len), dtype=jnp.int32)

    cand_ids = np.array([c.id for c in req.candidates], dtype=np.uint64)
    cand_authors = np.array([c.author_id for c in req.candidates], dtype=np.uint64)
    cand_surface = np.array([c.product_surface for c in req.candidates], dtype=np.int32)
    n = len(req.candidates)

    all_probs = []
    for i in range(0, n, cand_len):
        j = min(i + cand_len, n)
        cs = j - i
        cph = STATE["rank_hash_item"](cand_ids[i:j]).reshape(1, cs, -1)
        cah = STATE["rank_hash_author"](cand_authors[i:j]).reshape(1, cs, -1)
        cps = cand_surface[i:j].reshape(1, cs)
        if cs < cand_len:
            pad = cand_len - cs
            cph = np.pad(cph, ((0, 0), (0, pad), (0, 0)))
            cah = np.pad(cah, ((0, 0), (0, pad), (0, 0)))
            cps = np.pad(cps, ((0, 0), (0, pad)))
        batch = RecsysBatch(
            user_hashes=jnp.asarray(user_h),
            history_post_hashes=jnp.asarray(hist_post_h),
            history_author_hashes=jnp.asarray(hist_author_h),
            history_actions=hist_actions,
            history_product_surface=hist_surface,
            candidate_post_hashes=jnp.asarray(cph),
            candidate_author_hashes=jnp.asarray(cah),
            candidate_product_surface=jnp.asarray(cps),
        )
        emb = RecsysEmbeddings(
            user_embeddings=jnp.asarray(rank_emb[user_h]),
            history_post_embeddings=jnp.asarray(rank_emb[hist_post_h]),
            candidate_post_embeddings=jnp.asarray(rank_emb[cph]),
            history_author_embeddings=jnp.asarray(rank_emb[hist_author_h]),
            candidate_author_embeddings=jnp.asarray(rank_emb[cah]),
        )
        out = STATE["rank_fn"].apply(STATE["rank_params"], batch, emb)
        probs = jax.nn.sigmoid(out.logits)
        all_probs.append(np.asarray(probs[0, :cs, :]))

    probs = np.concatenate(all_probs)  # [n, num_actions]
    weighted = (
        probs[:, IDX_FAV] * 1.0
        + probs[:, IDX_REPLY] * 0.5
        + probs[:, IDX_RT] * 0.3
        + probs[:, IDX_DWELL] * 0.2
    )
    order = np.argsort(-weighted)
    ranked = [
        {
            "ref": req.candidates[int(k)].ref,
            "score": float(weighted[int(k)]),
            "actions": {int(a): float(probs[int(k), a]) for a in (IDX_FAV, IDX_REPLY, IDX_RT, IDX_DWELL)},
        }
        for k in order
    ]
    return {"ranked": ranked}


@app.post("/embed")
def embed(req: EmbedRequest):
    """Item-tower candidate representations for building the retrieval corpus."""
    if not req.items:
        return {"embeddings": []}
    ret_cfg = STATE["ret_cfg"]
    emb_size = STATE["emb_size"]
    ret_emb = STATE["ret_emb"]
    ret_model_config = build_model_config(ret_cfg, PhoenixRetrievalModelConfig)

    ids = np.array([it.id for it in req.items], dtype=np.uint64)
    authors = np.array([it.author_id for it in req.items], dtype=np.uint64)
    surface = np.array([it.product_surface for it in req.items], dtype=np.int32)
    n = len(req.items)

    post_h = STATE["ret_hash_item"](ids).reshape(1, n, -1)
    author_h = STATE["ret_hash_author"](authors).reshape(1, n, -1)

    def cand_forward(batch, embeddings):
        model = ret_model_config.make()
        rep, _ = model.build_candidate_representation(batch, embeddings)
        return rep

    fn = hk.without_apply_rng(hk.transform(cand_forward))
    batch = RecsysBatch(
        user_hashes=jnp.zeros((1, 2), dtype=jnp.int32),
        history_post_hashes=jnp.zeros((1, STATE["hist_len"], 2), dtype=jnp.int32),
        history_author_hashes=jnp.zeros((1, STATE["hist_len"], 2), dtype=jnp.int32),
        history_actions=jnp.zeros((1, STATE["hist_len"], STATE["num_actions"]), dtype=jnp.float32),
        history_product_surface=jnp.zeros((1, STATE["hist_len"]), dtype=jnp.int32),
        candidate_post_hashes=jnp.asarray(post_h),
        candidate_author_hashes=jnp.asarray(author_h),
        candidate_product_surface=jnp.asarray(surface.reshape(1, n)),
    )
    emb = RecsysEmbeddings(
        user_embeddings=jnp.zeros((1, 2, emb_size)),
        history_post_embeddings=jnp.zeros((1, STATE["hist_len"], 2, emb_size)),
        candidate_post_embeddings=jnp.asarray(ret_emb[post_h]),
        history_author_embeddings=jnp.zeros((1, STATE["hist_len"], 2, emb_size)),
        candidate_author_embeddings=jnp.asarray(ret_emb[author_h]),
    )
    rep = np.asarray(fn.apply(STATE["ret_params"], batch, emb)[0])  # [n, emb_size]
    return {
        "dim": emb_size,
        "embeddings": [{"ref": req.items[i].ref, "vector": rep[i].tolist()} for i in range(n)],
    }
