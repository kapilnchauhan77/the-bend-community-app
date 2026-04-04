#!/bin/sh
set -e

# Railway provides DATABASE_URL as postgresql://...
# SQLAlchemy async needs postgresql+asyncpg://...
if echo "$DATABASE_URL" | grep -q "^postgresql://"; then
  export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|')
fi

# Also fix Celery URLs if using Railway Redis
# Railway provides REDIS_URL; map to Celery vars if not set
if [ -n "$REDIS_URL" ] && [ -z "$CELERY_BROKER_URL" ]; then
  export CELERY_BROKER_URL="$REDIS_URL"
fi
if [ -n "$REDIS_URL" ] && [ -z "$CELERY_RESULT_BACKEND" ]; then
  export CELERY_RESULT_BACKEND="$REDIS_URL"
fi

echo "Running database migrations..."
alembic upgrade head

echo "Running seed data..."
python -m app.seed

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 2
