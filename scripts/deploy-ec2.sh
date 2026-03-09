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
PARAM_NAME="${PARAM_NAME:-/go-sim-frontend/production/env}"
PM2_APP_NAME="${PM2_APP_NAME:-go-sim-frontend}"

# Ensure log directory exists before redirecting output
mkdir -p "$(dirname "$LOG_FILE")" "$APP_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "[$(date -Iseconds)] Deploy started: BUCKET=$BUCKET REGION=$REGION APP_DIR=$APP_DIR PARAM_NAME=$PARAM_NAME"

cd "$APP_DIR" || { echo "ERROR: cannot cd to $APP_DIR"; exit 1; }

echo "[$(date -Iseconds)] Downloading build from S3..."
aws s3 cp "s3://${BUCKET}/go-sim-frontend/build.tar.gz" /tmp/build.tar.gz --region "$REGION"

echo "[$(date -Iseconds)] Extracting build..."
tar -xzf /tmp/build.tar.gz -C "$APP_DIR"
rm -f /tmp/build.tar.gz

echo "[$(date -Iseconds)] Installing production dependencies..."
npm ci --omit=dev

echo "[$(date -Iseconds)] Fetching env from Parameter Store..."
if ! aws ssm get-parameter \
  --name "$PARAM_NAME" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text \
  --region "$REGION" > .env.local; then
  echo "ERROR: Failed to fetch SSM parameter $PARAM_NAME"
  exit 1
fi
if [ ! -s .env.local ]; then
  echo "ERROR: .env.local is empty after fetch (check parameter $PARAM_NAME)"
  exit 1
fi
echo "[$(date -Iseconds)] Wrote .env.local ($(wc -l < .env.local) lines)"

# Load .env.local so we can pass vars into PM2; Next.js also loads .env.local from cwd at runtime
set -a
# shellcheck source=/dev/null
source .env.local || { echo "ERROR: Failed to source .env.local (check format)"; exit 1; }
set +a
# Pass BACKEND_BASE explicitly so the Node process gets it even if PM2 daemon started without it
export BACKEND_BASE="${BACKEND_BASE:-}"

echo "[$(date -Iseconds)] Restarting PM2 app $PM2_APP_NAME..."
if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  pm2 start ecosystem.config.js
fi

echo "[$(date -Iseconds)] Deploy finished successfully"
