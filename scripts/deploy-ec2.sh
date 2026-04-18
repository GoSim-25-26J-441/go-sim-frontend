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
# Env (optional): APP_DIR, PARAM_NAME, SYSTEMD_UNIT_NAME, NGINX_CONF_D
#   APP_DIR: app directory (default: /opt/go-sim-frontend)
#   PARAM_NAME: Parameter Store path for .env (default: /arcfind/production/frontend)
#   SYSTEMD_UNIT_NAME: systemd unit (default: go-sim-frontend)
#   NGINX_CONF_D: nginx conf.d directory (default: /etc/nginx/conf.d). Vhost file is always
#     app.microsim.dev.conf under that directory; it is installed only if missing.

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

# Nginx vhost: ship template in build tarball as scripts/app.microsim.dev.conf
NGINX_CONF_D="${NGINX_CONF_D:-/etc/nginx/conf.d}"
NGINX_VHOST_BASENAME="app.microsim.dev.conf"
NGINX_INSTALLED="${NGINX_CONF_D}/${NGINX_VHOST_BASENAME}"
NGINX_TEMPLATE="${APP_DIR}/scripts/${NGINX_VHOST_BASENAME}"

if command -v nginx >/dev/null 2>&1 && [ -d "$NGINX_CONF_D" ]; then
  if [ -f "$NGINX_INSTALLED" ]; then
    echo "[$(date -Iseconds)] Nginx vhost already present: $NGINX_INSTALLED (skip install)"
  elif [ -f "$NGINX_TEMPLATE" ]; then
    echo "[$(date -Iseconds)] Installing nginx vhost -> $NGINX_INSTALLED"
    install -m 0644 "$NGINX_TEMPLATE" "$NGINX_INSTALLED"
    if nginx -t 2>&1; then
      systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true
      echo "[$(date -Iseconds)] Nginx reloaded"
    else
      echo "[$(date -Iseconds)] WARNING: nginx -t failed; removing new vhost file"
      rm -f "$NGINX_INSTALLED"
    fi
  else
    echo "[$(date -Iseconds)] No bundled nginx template at $NGINX_TEMPLATE (add scripts/${NGINX_VHOST_BASENAME} to build tarball)"
  fi
elif [ -f "$NGINX_TEMPLATE" ]; then
  echo "[$(date -Iseconds)] Nginx template present but nginx or $NGINX_CONF_D missing; skip vhost install"
else
  echo "[$(date -Iseconds)] No nginx template at $NGINX_TEMPLATE"
fi

echo "[$(date -Iseconds)] Deploy finished successfully"
