#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# The Bend Community — VM Deploy Script
# Pulls latest code, rebuilds images, restarts the stack.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "ERROR: .env not found. Copy .env.production.example to .env and fill in values."
    exit 1
fi

echo "→ Pulling latest code..."
git pull

echo "→ Building images..."
docker compose -f docker-compose.prod.yml build

echo "→ Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "→ Service status:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✓ Deploy complete. Tail logs with:"
echo "    docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "Useful commands:"
echo "    Stop:     docker compose -f docker-compose.prod.yml down"
echo "    Restart:  docker compose -f docker-compose.prod.yml restart <service>"
echo "    Shell:    docker compose -f docker-compose.prod.yml exec backend bash"
echo "    Seed:     docker compose -f docker-compose.prod.yml exec backend python -m app.seed"
echo "    Clear:    docker compose -f docker-compose.prod.yml exec backend python -m app.seed clear"
