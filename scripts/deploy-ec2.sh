#!/usr/bin/env bash
# Deploy script for go-sim-frontend on EC2.
# Invoked via SSM (e.g. from GitHub Actions). Downloads build from S3, extracts,
# installs deps, fetches .env from Parameter Store, ensures systemd unit
# go-sim-frontend.service exists, restarts the app, optionally installs nginx vhost.
#
# Usage: ./deploy-ec2.sh BUCKET REGION
#   BUCKET: S3 bucket (e.g. arcfind-builds)
#   REGION: AWS region (e.g. us-east-1)
#
# Env (optional): APP_DIR, PARAM_NAME, SYSTEMD_UNIT_NAME, NGINX_CONF_DEST
#   APP_DIR: app directory (default: /opt/go-sim-frontend)
#   PARAM_NAME: Parameter Store path for .env (default: /arcfind/production/frontend)
#   SYSTEMD_UNIT_NAME: systemd unit (default: go-sim-frontend)
#   NGINX_CONF_DEST: if set, copy bundled nginx vhost here (default when nginx exists:
#     /etc/nginx/conf.d/go-sim-frontend.conf). Set empty to skip nginx.

set -e

BUCKET="${1:?Usage: deploy-ec2.sh BUCKET REGION}"
REGION="${2:?Usage: deploy-ec2.sh BUCKET REGION}"

LOG_FILE="${LOG_FILE:-/opt/go-sim-frontend/deploy.log}"
APP_DIR="${APP_DIR:-/opt/go-sim-frontend}"
PARAM_NAME="${PARAM_NAME:-/arcfind/production/frontend}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-go-sim-frontend}"
SYSTEMD_UNIT_PATH="/etc/systemd/system/${SYSTEMD_UNIT_NAME}.service"
# Next.js bind address (nginx reverse-proxies to this)
APP_HOST="${APP_HOST:-127.0.0.1}"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "[$(date -Iseconds)] Deploy started: BUCKET=$BUCKET REGION=$REGION APP_DIR=$APP_DIR"

mkdir -p "$APP_DIR"
cd "$APP_DIR" || { echo "ERROR: cannot cd to $APP_DIR"; exit 1; }

echo "[$(date -Iseconds)] Downloading build from S3..."
aws s3 cp "s3://${BUCKET}/go-sim-frontend/build.tar.gz" /tmp/build.tar.gz --region "$REGION"

echo "[$(date -Iseconds)] Extracting build..."
tar -xzf /tmp/build.tar.gz -C "$APP_DIR"
rm -f /tmp/build.tar.gz

echo "[$(date -Iseconds)] Installing production dependencies..."
npm ci --omit=dev

echo "[$(date -Iseconds)] Fetching env from Parameter Store..."
aws ssm get-parameter \
  --name "$PARAM_NAME" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text \
  --region "$REGION" > .env.local
echo "[$(date -Iseconds)] Wrote .env.local"

# Optional: load .env.local in this shell for logging / one-off checks (systemd uses EnvironmentFile)
if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  source .env.local 2>/dev/null || true
  set +a
  echo "[$(date -Iseconds)] Loaded .env.local (for deploy context)"
fi

write_systemd_unit() {
  cat >"$SYSTEMD_UNIT_PATH" <<EOF
[Unit]
Description=go-sim-frontend (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
# PORT and other keys come from Parameter Store (.env.local)
EnvironmentFile=-${APP_DIR}/.env.local
# PORT comes from EnvironmentFile; default 3000 if unset
ExecStart=/bin/bash -c 'cd ${APP_DIR} && exec /usr/bin/npm run start -- --hostname ${APP_HOST} --port "\${PORT:-3000}"'
Restart=always
RestartSec=5
# Allow time for Next.js to bind
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF
}

if [ ! -f "$SYSTEMD_UNIT_PATH" ]; then
  echo "[$(date -Iseconds)] Creating systemd unit $SYSTEMD_UNIT_PATH (first install)"
  write_systemd_unit
  systemctl daemon-reload
  systemctl enable "${SYSTEMD_UNIT_NAME}.service"
else
  echo "[$(date -Iseconds)] Systemd unit already present: $SYSTEMD_UNIT_PATH (not overwriting)"
fi

echo "[$(date -Iseconds)] Restarting systemd service ${SYSTEMD_UNIT_NAME}..."
systemctl daemon-reload
systemctl enable "${SYSTEMD_UNIT_NAME}.service" 2>/dev/null || true
systemctl restart "${SYSTEMD_UNIT_NAME}.service"
systemctl --no-pager -l status "${SYSTEMD_UNIT_NAME}.service" || true

# Nginx vhost: ship template in build tarball at scripts/nginx-go-sim-frontend.conf
NGINX_TEMPLATE="${APP_DIR}/scripts/nginx-go-sim-frontend.conf"
if command -v nginx >/dev/null 2>&1 && [ -f "$NGINX_TEMPLATE" ]; then
  NGINX_DEST="${NGINX_CONF_DEST:-/etc/nginx/conf.d/go-sim-frontend.conf}"
  echo "[$(date -Iseconds)] Installing nginx vhost -> $NGINX_DEST"
  install -m 0644 "$NGINX_TEMPLATE" "$NGINX_DEST"
  if nginx -t 2>&1; then
    systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
    echo "[$(date -Iseconds)] Nginx reloaded"
  else
    echo "[$(date -Iseconds)] WARNING: nginx -t failed; leaving vhost file in place"
  fi
elif [ -f "$NGINX_TEMPLATE" ]; then
  echo "[$(date -Iseconds)] Nginx template present but nginx not installed; skip vhost install"
else
  echo "[$(date -Iseconds)] No nginx template at $NGINX_TEMPLATE (add scripts/nginx-go-sim-frontend.conf to build tarball)"
fi

echo "[$(date -Iseconds)] Deploy finished successfully"
