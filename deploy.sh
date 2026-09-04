#!/usr/bin/env bash
# Pull tested images, switch application services, and roll back on failed health.
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo "ERROR: $*" >&2; exit 1; }
[[ $# == 3 ]] || fail "Usage: ./deploy.sh COMMIT_SHA BACKEND@sha256:DIGEST FRONTEND@sha256:DIGEST"
revision=$1
backend=$2
frontend=$3
[[ $revision =~ ^[0-9a-f]{40}$ ]] || fail "A full commit SHA is required"
for image in "$backend" "$frontend"; do
    [[ $image =~ ^[a-zA-Z0-9./_-]+@sha256:[0-9a-f]{64}$ ]] || fail "Images must use immutable sha256 digests"
done
[[ -f .env ]] || fail "Production .env is missing"
[[ $(git -c safe.directory="$PWD" rev-parse HEAD) == "$revision" ]] || fail "Checkout does not match the image revision"
[[ -z $(git -c safe.directory="$PWD" status --porcelain --untracked-files=no) ]] || fail "Tracked checkout changes must be resolved first"
exec 9>.deploy.lock
flock -n 9 || fail "Another deployment is running"

compose=(docker compose --env-file .env)
[[ ! -f .release.env ]] || compose+=(--env-file .release.env)
compose+=(-f docker-compose.prod.yml)
services=(backend frontend celery-worker celery-beat)

# Pull and validate both images before touching running containers.
docker pull "$backend"
docker pull "$frontend"
for image in "$backend" "$frontend"; do
    actual=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
    [[ $actual == "$revision" ]] || fail "Image revision does not match $revision"
done

# Pin every current service separately. Workers may still run an older release.
rollback_tags=()
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
for service in "${services[@]}"; do
    container=$("${compose[@]}" ps -q "$service")
    [[ -n $container ]] || fail "Cannot capture rollback image for $service"
    current=$(docker inspect --format '{{.Image}}' "$container")
    tag="bend-rollback/$service:$release_id"
    docker tag "$current" "$tag"
    rollback_tags+=("$tag")
done

export BEND_BACKEND_IMAGE="$backend" BEND_FRONTEND_IMAGE="$frontend"
export BEND_WORKER_IMAGE="$backend" BEND_BEAT_IMAGE="$backend"

health() {
    "${compose[@]}" exec -T backend python -c \
      'import json,urllib.request; r=json.load(urllib.request.urlopen("http://localhost:8000/api/v1/health",timeout=5)); assert r["status"]=="healthy" and r["db"]=="ok"' >/dev/null 2>&1 &&
    "${compose[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/ &&
    "${compose[@]}" exec -T celery-worker python -c \
      'import os; assert os.path.exists("/proc/1")' >/dev/null 2>&1 &&
    "${compose[@]}" exec -T celery-beat python -c \
      'import os; assert os.path.exists("/proc/1")' >/dev/null 2>&1
}

rollback() {
    trap - ERR INT TERM
    echo "Release failed. Restoring previous application images." >&2
    export BEND_BACKEND_IMAGE="${rollback_tags[0]}" BEND_FRONTEND_IMAGE="${rollback_tags[1]}"
    export BEND_WORKER_IMAGE="${rollback_tags[2]}" BEND_BEAT_IMAGE="${rollback_tags[3]}"
    if "${compose[@]}" up -d --no-deps --no-build --pull never "${services[@]}"; then
        echo "Previous images restored. Check health before retrying." >&2
    else
        echo "ROLLBACK FAILED. Manual recovery required." >&2
    fi
    exit 1
}
trap rollback ERR INT TERM
"${compose[@]}" up -d --no-deps --no-build --pull never "${services[@]}"
healthy=false
for ((attempt=0; attempt<${HEALTH_ATTEMPTS:-30}; attempt++)); do
    if health; then healthy=true; break; fi
    sleep 5
done
[[ $healthy == true ]] || rollback

# Only replace release pointers after health passes. Keep .env untouched.
umask 077
printf 'BEND_BACKEND_IMAGE=%s\nBEND_FRONTEND_IMAGE=%s\nBEND_WORKER_IMAGE=%s\nBEND_BEAT_IMAGE=%s\n' \
    "${rollback_tags[@]}" > .release.previous.env.tmp
mv .release.previous.env.tmp .release.previous.env
printf 'BEND_REVISION=%s\nBEND_BACKEND_IMAGE=%s\nBEND_FRONTEND_IMAGE=%s\nBEND_WORKER_IMAGE=%s\nBEND_BEAT_IMAGE=%s\n' \
    "$revision" "$backend" "$frontend" "$backend" "$backend" > .release.env.tmp
mv .release.env.tmp .release.env
trap - ERR INT TERM
"${compose[@]}" ps "${services[@]}"
echo "Deployed $revision from tested images. Health checks passed."
