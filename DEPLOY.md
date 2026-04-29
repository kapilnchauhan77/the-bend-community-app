# Self-Hosted VM Deployment

Single-VM deployment with Docker Compose, Caddy reverse proxy, and Let's Encrypt wildcard SSL via Cloudflare DNS challenge.

## Architecture

```
Internet (443/80)
    ↓
Caddy (SSL termination, wildcard cert)
    ├── api.bend.community → backend (FastAPI/uvicorn)
    └── bend.community / *.bend.community → frontend (nginx serving Vite SPA)

backend → Postgres + Redis
celery-worker, celery-beat → Redis + Postgres
```

## VM Prerequisites

- Ubuntu 22.04+ / Debian 12+ — 4 GB RAM, 2 vCPU, 40 GB disk minimum
- Ports **80** and **443** open in firewall (`ufw allow 80,443/tcp`)
- Public IPv4 address

## One-Time Setup

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out & back in
```

### 2. Cloudflare DNS

Point your domain at the VM. In Cloudflare DNS:

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `@` | VM_PUBLIC_IP | DNS only (grey cloud) |
| A | `*` | VM_PUBLIC_IP | DNS only (grey cloud) |

**Important:** Set proxy to **DNS only** (grey cloud). Caddy handles SSL itself; Cloudflare proxy will conflict.

### 3. Cloudflare API Token (for wildcard cert via DNS-01)

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. Use the **"Edit zone DNS"** template
3. Permissions:
   - Zone → Zone → Read
   - Zone → DNS → Edit
4. Zone Resources → Include → Specific zone → `bend.community`
5. Save the token; add to `.env` as `CLOUDFLARE_API_TOKEN`

### 4. Clone and configure

```bash
git clone <repo-url> bend-app
cd bend-app
cp .env.production.example .env
# Edit .env — fill in:
#   CLOUDFLARE_API_TOKEN, POSTGRES_PASSWORD, JWT_SECRET_KEY, SECRET_KEY,
#   SUPER_ADMIN_EMAIL/PASSWORD, STRIPE_*, SENDGRID_API_KEY
nano .env
```

### 5. Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

First run takes 5-10 minutes (image builds + DB init + migrations + seed + cert issuance).

## Verification

```bash
# Backend healthy
curl https://api.bend.community/api/v1/health
# → {"status":"healthy","db":"ok"}

# Tenant resolves
curl -H "X-Tenant-Slug: westmoreland" https://api.bend.community/api/v1/tenant/current
# → JSON with display_name "The Bend — Westmoreland"

# Landing page
curl -I https://bend.community
# → HTTP/2 200

# Tenant app
curl -I https://westmoreland.bend.community
# → HTTP/2 200

# Migration ran
docker compose -f docker-compose.prod.yml logs backend | grep alembic
```

## Operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f backend

# Restart a service
docker compose -f docker-compose.prod.yml restart backend

# Backend shell
docker compose -f docker-compose.prod.yml exec backend bash

# Run seed (idempotent)
docker compose -f docker-compose.prod.yml exec backend python -m app.seed

# Clear dummy data (preserves tenants + admin accounts)
docker compose -f docker-compose.prod.yml exec backend python -m app.seed clear

# DB shell
docker compose -f docker-compose.prod.yml exec db psql -U thebend thebend

# Stop everything
docker compose -f docker-compose.prod.yml down

# Stop + remove volumes (DESTROYS DATA)
docker compose -f docker-compose.prod.yml down -v
```

## Updating

```bash
./deploy.sh   # git pull + rebuild + restart
```

## Backups

Recommended: daily `pg_dump` to off-VM storage (S3, another VM, etc.):

```bash
# crontab -e
0 3 * * * cd /path/to/bend-app && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U thebend thebend | gzip > /backups/thebend-$(date +\%F).sql.gz
```

## Troubleshooting

**Caddy can't get SSL cert:** check `CLOUDFLARE_API_TOKEN` permissions and that DNS is **not** proxied (grey cloud).
```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "tls\|acme\|error"
```

**Backend 502:** backend hasn't finished starting (migrations + seed take ~30s on first boot).
```bash
docker compose -f docker-compose.prod.yml logs backend
```

**Frontend shows old data:** browser/Cloudflare cache. Hard refresh; in dashboard purge cache.

**Wildcard subdomain doesn't work:** verify the `*` A record exists and isn't proxied.
