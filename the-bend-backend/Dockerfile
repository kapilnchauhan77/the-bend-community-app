FROM python:3.11-slim

WORKDIR /app

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

# Install system dependencies
# ffmpeg ships ffprobe too; needed by the video upload pipeline for
# duration probing and poster-frame generation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy application and install the exact locked production environment.
COPY . .
RUN pip install --no-cache-dir "uv==0.10.4" \
    && uv sync --frozen --no-dev --no-editable

# Create uploads directory
RUN mkdir -p uploads/images uploads/guidelines uploads/videos uploads/audio

# Expose port
EXPOSE 8000

# Run with production settings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
