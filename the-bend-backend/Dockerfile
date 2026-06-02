FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
# ffmpeg ships ffprobe too; needed by the video upload pipeline for
# duration probing and poster-frame generation.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy application and install dependencies
COPY . .
RUN pip install --no-cache-dir . && pip install "bcrypt==4.0.1"

# Create uploads directory
RUN mkdir -p uploads/images uploads/guidelines uploads/videos

# Expose port
EXPOSE 8000

# Run with production settings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
