# Phoenix feed-ranker service for GCP Cloud Run.
#
# Self-fetching build: the model code + ~3 GB LFS weights are pulled from GitHub
# DURING the build (Cloud Build runs in-datacenter with fast bandwidth), so the
# build context is tiny (just service.py) — no multi-GB upload from a dev box.

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "jax==0.8.1" "jaxlib==0.8.1" "dm-haiku>=0.0.13" "numpy>=1.26.4" \
    "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.0"

# PINNED — do NOT change to a branch or to main.
#
# xai-org restructured the repo on 2026-08-13: phoenix/ moved to xrex/ + crates/
# + python/ + reference/, and `phoenix/artifacts/` — including the exported
# checkpoint `oss-phoenix-artifacts.zip` this service RUNS ON — was deleted.
# There is no .npz or .zip anywhere in the tree at main any more. So building
# from main fails twice over: the `cp` below finds no such files, and the unzip
# has nothing to unzip. This SHA is the last commit that carries the checkpoint.
#
# Consequence: the pin is the only supply of these weights. A local copy exists
# at ../x-algorithm/phoenix/artifacts/ (2.9 GB, real file, not an LFS pointer) —
# back it up somewhere durable rather than trusting the pin to stay fetchable.
ARG XALGO_SHA=0bfc2795d308f90032544322747caacd535f75ae

# Fetch the model repo with LFS weights, extract artifacts, keep only what the
# service needs, then drop the clone + zip to keep the image as small as possible.
# Shallow fetch-by-SHA rather than `clone --depth 1` (which cannot take a SHA).
RUN git lfs install \
    && mkdir -p /src && cd /src \
    && git init -q && git remote add origin https://github.com/xai-org/x-algorithm.git \
    && git fetch -q --depth 1 origin "${XALGO_SHA}" \
    && git checkout -q FETCH_HEAD \
    && cd /src/phoenix && git lfs pull \
    && unzip -o artifacts/oss-phoenix-artifacts.zip -d artifacts/ \
    && cp grok.py recsys_model.py recsys_retrieval_model.py runners.py run_pipeline.py /app/ \
    && mkdir -p /app/artifacts \
    && cp -r artifacts/oss-phoenix-artifacts /app/artifacts/oss-phoenix-artifacts \
    && rm -rf /src

# Our FastAPI overlay (the only thing in the build context).
COPY service.py /app/

ENV PHOENIX_ARTIFACTS=/app/artifacts/oss-phoenix-artifacts

CMD ["sh", "-c", "uvicorn service:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
