# Phoenix feed-ranker service for GCP Cloud Run.
# Bakes the ~3 GB model artifacts into the image so cold starts don't download
# them. Build context is this phoenix/ dir (see cloudbuild.yaml + .dockerignore).

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps. CPU-only JAX (Cloud Run has no GPU); matches the pinned versions
# verified locally.
RUN pip install --no-cache-dir \
    "jax==0.8.1" "jaxlib==0.8.1" "dm-haiku>=0.0.13" "numpy>=1.26.4" \
    "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.0"

# Model source files (the reference pipeline modules service.py imports).
COPY grok.py recsys_model.py recsys_retrieval_model.py runners.py run_pipeline.py service.py ./

# Extracted artifacts (retrieval/ + ranker/ + corpus). The raw .zip is excluded
# via .dockerignore — must be unzipped before building (see cloudbuild.yaml).
COPY artifacts/oss-phoenix-artifacts ./artifacts/oss-phoenix-artifacts

ENV PHOENIX_ARTIFACTS=/app/artifacts/oss-phoenix-artifacts

# Cloud Run injects $PORT (default 8080). Single worker — the model is large and
# JAX is internally threaded; concurrency is set on the Cloud Run service.
CMD ["sh", "-c", "uvicorn service:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]
