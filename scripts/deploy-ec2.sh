#!/usr/bin/env bash
# Deploy script for go-sim-frontend on EC2.
# Invoked via SSM (e.g. from GitHub Actions). Downloads build from S3, extracts,
# installs deps, fetches .env from Parameter Store, restarts PM2.
#
# Usage: ./deploy-ec2.sh BUCKET REGION
#   BUCKET: S3 bucket (e.g. arcfind-builds)
#   REGION: AWS region (e.g. us-east-1)
#
# Env (optional): APP_DIR, PARAM_NAME, PM2_APP_NAME
#   APP_DIR: app directory (default: ~/go-sim-frontend)
#   PARAM_NAME: Parameter Store path for .env (default: /go-sim-frontend/production/env)
#   PM2_APP_NAME: PM2 process name (default: go-sim-frontend)

set -e

BUCKET="${1:?Usage: deploy-ec2.sh BUCKET REGION}"
REGION="${2:?Usage: deploy-ec2.sh BUCKET REGION}"

LOG_FILE="${LOG_FILE:-/opt/go-sim-frontend/deploy.log}"
APP_DIR="${APP_DIR:-/opt/go-sim-frontend}"
PARAM_NAME="${PARAM_NAME:-/arcfind/production/frontend}"
PM2_APP_NAME="${PM2_APP_NAME:-go-sim-frontend}"

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

# Load .env.local into this shell so PM2 child process inherits (BACKEND_BASE etc.)
if [ -f .env.local ]; then
  set -a
  # shellcheck source=/dev/null
  source .env.local 2>/dev/null || true
  set +a
  echo "[$(date -Iseconds)] Exported env from .env.local for PM2"
fi

echo "[$(date -Iseconds)] Restarting PM2 app $PM2_APP_NAME..."
if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  pm2 start ecosystem.config.js
fi

echo "[$(date -Iseconds)] Deploy finished successfully"
