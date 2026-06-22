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

# Clone the model repo with LFS weights, extract artifacts, keep only what the
# service needs, then drop the clone + zip to keep the image as small as possible.
RUN git lfs install \
    && git clone --depth 1 https://github.com/xai-org/x-algorithm.git /src \
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
