# syntax=docker/dockerfile:1
FROM python:3.11-slim AS dependencies

WORKDIR /app

# Install system dependencies
# ffmpeg ships ffprobe too; needed by the video upload pipeline for
# duration probing and poster-frame generation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Source changes do not invalidate the runtime dependency layer.
COPY pyproject.toml requirements.lock ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.lock

FROM dependencies AS runtime
COPY . .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps . && pip check

# Create uploads directory
RUN mkdir -p uploads/images uploads/guidelines uploads/videos uploads/audio uploads/link-previews

# Expose port
EXPOSE 8000

# Run with production settings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

FROM runtime AS test
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install "pytest==8.3.5" "pytest-asyncio==0.25.3" "factory-boy==3.3.3"
CMD ["python", "-m", "pytest", "-q"]

FROM runtime AS production
ARG REVISION
LABEL org.opencontainers.image.revision=${REVISION}
