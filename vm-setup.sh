#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# The Bend Community — Fresh VM Bootstrap
# Run as root (or with sudo) on a fresh Ubuntu 22.04+ / Debian 12+ VM
# Sets up: Docker, firewall, fail2ban, app directory, and clones the repo.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<your-user>/<repo>/main/vm-setup.sh | sudo bash -s -- <git-repo-url>
# Or:
#   wget https://.../vm-setup.sh && sudo bash vm-setup.sh <git-repo-url>
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="${1:-}"
APP_USER="${APP_USER:-bend}"
APP_DIR="${APP_DIR:-/opt/bend}"

if [ -z "$REPO_URL" ]; then
    echo "ERROR: pass the git repo URL as the first argument."
    echo "Usage: sudo bash vm-setup.sh https://github.com/you/the_bend_community_app.git"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "ERROR: must run as root (use sudo)."
    exit 1
fi

echo "▶ Updating package index..."
apt-get update -y
apt-get upgrade -y

echo "▶ Installing base packages..."
apt-get install -y \
    ca-certificates curl gnupg lsb-release \
    git ufw fail2ban htop unattended-upgrades \
    python3 python3-pip jq

echo "▶ Installing Docker + Compose plugin..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null \
    || curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

DISTRO=$(. /etc/os-release && echo "$ID")
CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$DISTRO $CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

echo "▶ Creating app user '$APP_USER'..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$APP_USER"
fi
usermod -aG docker "$APP_USER"

echo "▶ Configuring firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp  # HTTP/3
ufw --force enable

echo "▶ Configuring fail2ban..."
systemctl enable --now fail2ban

echo "▶ Enabling automatic security updates..."
dpkg-reconfigure --priority=low unattended-upgrades || true

echo "▶ Cloning repo to $APP_DIR..."
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"

echo "▶ Creating .env from template..."
if [ ! -f "$APP_DIR/.env" ]; then
    sudo -u "$APP_USER" cp "$APP_DIR/.env.production.example" "$APP_DIR/.env"
fi

# Generate secure random secrets
echo "▶ Generating secure secrets..."
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
PG_PASS=$(openssl rand -hex 24)
SUPER_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)

sudo -u "$APP_USER" sed -i \
    -e "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET_KEY}|" \
    -e "s|^JWT_SECRET_KEY=.*|JWT_SECRET_KEY=${JWT_SECRET}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" \
    -e "s|^SUPER_ADMIN_PASSWORD=.*|SUPER_ADMIN_PASSWORD=${SUPER_PASS}|" \
    "$APP_DIR/.env"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✓ VM bootstrap complete."
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Generated credentials (saved to $APP_DIR/.env):"
echo "  Postgres password:   $PG_PASS"
echo "  Super admin password: $SUPER_PASS"
echo ""
echo "NEXT STEPS:"
echo ""
echo "  1. Edit .env and add your Cloudflare/Stripe/SendGrid keys:"
echo "       sudo -u $APP_USER nano $APP_DIR/.env"
echo ""
echo "     Required:"
echo "       - CLOUDFLARE_API_TOKEN (Zone:DNS:Edit on bend.community)"
echo "       - STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET"
echo "       - SENDGRID_API_KEY"
echo "       - ACME_EMAIL"
echo ""
echo "  2. Point DNS in Cloudflare (DNS only — grey cloud):"
echo "       A  @  $(curl -s ifconfig.me 2>/dev/null || echo '<this VM IP>')"
echo "       A  *  $(curl -s ifconfig.me 2>/dev/null || echo '<this VM IP>')"
echo ""
echo "  3. Deploy:"
echo "       sudo -u $APP_USER bash -c 'cd $APP_DIR && ./deploy.sh'"
echo ""
echo "  4. Watch logs:"
echo "       sudo -u $APP_USER docker compose -f $APP_DIR/docker-compose.prod.yml logs -f"
echo ""
echo "════════════════════════════════════════════════════════════════"
