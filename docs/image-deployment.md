# Deploy prebuilt application images

Build on Cloud Build, never on the production VM. The backend, frontend, worker,
and scheduler use images from the same source revision. Caddy, PostgreSQL, Redis,
and persistent uploads are not replaced by this release script.

## Build

Use a clean committed checkout. Upload a `git archive` of the commit, not a working
directory containing credentials or uploads. Run `gcloud builds submit` on that
archive's extracted directory with `cloudbuild.yaml` and these substitutions:

```
_REVISION=<full-commit-sha>
_VITE_API_URL=https://api.bend.community/api/v1
_VITE_BASE_DOMAIN=bend.community
_VITE_CF_ANALYTICS_TOKEN=<existing-public-analytics-token>
```

Cloud Build runs backend tests and the deployment-script tests before publishing
release images. BuildKit imports and exports separate backend and frontend
registry caches with `mode=max`, including intermediate dependency layers.
Backend runtime versions are pinned in `the-bend-backend/requirements.lock`.
The frontend uses `package-lock.json`. Change locks deliberately with their
manifests. The backend image runs `pip check` to reject incompatible dependencies.

Require a successful build for the merged `main` SHA. Resolve the resulting
`gcr.io/<project>/bend-backend:<sha>` and `bend-frontend:<sha>` tags to their
registry digests. Never deploy mutable tags or a failed build's partial output.

## Deploy

On the production VM, authenticate Docker to the registry, verify no other
deployment is active, and fast-forward `/opt/bend` to the built commit. Keep the
existing `.env`. Run:

```sh
sudo ./deploy.sh <full-commit-sha> <backend-image@sha256:digest> <frontend-image@sha256:digest>
```

The script checks image revision labels and captures each running service's
previous image. It only pulls images and runs Compose with `--no-build` and
`--no-deps`. Failed health checks restore the previous images. Successful releases
write `.release.env` and `.release.previous.env` without changing `.env`.

Use the active release file for later management commands:

```sh
sudo docker compose --env-file .env --env-file .release.env -f docker-compose.prod.yml ps
```

For a manual image rollback, use `.release.previous.env` with
`up -d --no-deps --no-build --pull never backend frontend celery-worker celery-beat`,
then verify health and copy that file to `.release.env`. Do not prune rollback
images until the release is accepted. Image rollback does not reverse database
migrations. Review migration compatibility before each release.
