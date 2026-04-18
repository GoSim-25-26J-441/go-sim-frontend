# Deploy go-sim-frontend to EC2 (systemd + optional nginx)

This app is deployed to an EC2 instance using GitHub Actions (build in CI), S3, and AWS SSM Run Command. The workflow runs CI on push/PR; deploy runs only on push to `main` (or manual trigger). The build artifact and deploy script are uploaded to S3; SSM runs the script on EC2, which downloads the build from S3, installs deps, fetches `.env` from Parameter Store, ensures the **`go-sim-frontend` systemd service** exists, restarts it, and optionally installs an **nginx vhost** when nginx is installed.

## Architecture

- **GitHub Actions**
  - **CI job:** On push or pull_request to main, dev, ci: checkout, `npm i`, `npm run build`.
  - **Deploy job:** After CI, only on push to main (or `workflow_dispatch`). Builds the app, creates a tarball (`.next`, `public`, `package.json`, `package-lock.json`, `ecosystem.config.js`, `scripts/nginx-go-sim-frontend.conf`), uploads it to `s3://<DEPLOY_BUCKET>/go-sim-frontend/build.tar.gz`, uploads `scripts/deploy-ec2.sh` to `s3://<DEPLOY_BUCKET>/go-sim-frontend/scripts/deploy.sh`, then invokes SSM to run a command on EC2 that downloads the script from S3 and executes `deploy.sh BUCKET REGION`.
  - **Deploy completion:** The workflow waits on **SSM `get-command-invocation` only** (`Status` / `ResponseCode`). There is **no HTTP health check** against the app URL; treat SSM `Success` + `ResponseCode` 0 as deploy success.
- **EC2:** The deploy script downloads the build from S3, extracts to the app directory, runs `npm ci --omit=dev`, fetches env from Parameter Store into `.env.local`, creates `/etc/systemd/system/go-sim-frontend.service` **if missing**, then `systemctl restart go-sim-frontend`. If `nginx` is on the host and `scripts/nginx-go-sim-frontend.conf` is in the tarball, the script copies it to `/etc/nginx/conf.d/go-sim-frontend.conf`, runs `nginx -t`, and reloads nginx.

## Prerequisites

### EC2 instance

- **OS:** Amazon Linux 2 or Ubuntu (SSM Agent pre-installed).
- **Software:** Node.js 20+ (`node`, `npm` on `PATH`). **systemd** (default on these AMIs).
- **Optional:** nginx for TLS/reverse-proxy on port 80 → app on `127.0.0.1:${PORT:-3000}` (`PORT` can be set in Parameter Store `.env.local`).
- **App directory:** Default `/opt/go-sim-frontend` (override with `APP_DIR`). The script creates it and extracts the build there.
- **IAM role (instance profile):** The EC2 instance role must allow:
  - `s3:GetObject` for `arn:aws:s3:::<DEPLOY_BUCKET>/go-sim-frontend/*`
  - `ssm:GetParameter` for the Parameter Store path used by `PARAM_NAME`
  - If using nginx install: ability to write to `/etc/nginx/conf.d/` and reload nginx (deploy runs as root via SSM by default).

### AWS Parameter Store

- **Name:** e.g. `/arcfind/production/frontend` (or override `PARAM_NAME` on the instance / in SSM env).
- **Type:** SecureString
- **Value:** Full `.env.local` content (`KEY=VALUE` per line), including at least `BACKEND_BASE` / `NEXT_PUBLIC_*` as needed. Optional: `PORT=3000` for the port Next listens on (systemd passes it into `npm run start`).

### GitHub OIDC and IAM role

Same as before: GitHub assumes a role with `ssm:SendCommand`, `ssm:GetCommandInvocation`, S3 upload permissions, etc.

### GitHub secrets

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | IAM role for GitHub OIDC. |
| `AWS_REGION` | e.g. `us-east-1`. |
| `DEPLOY_BUCKET` | S3 bucket for deploy artifacts. |
| `EC2_INSTANCE_ID` | Target EC2 instance ID. |

## Customizing the deploy script on EC2

Optional environment variables:

- **APP_DIR:** App directory (default: `/opt/go-sim-frontend`).
- **PARAM_NAME:** Parameter Store path for the env file (default: `/arcfind/production/frontend`).
- **SYSTEMD_UNIT_NAME:** systemd unit name without `.service` (default: `go-sim-frontend`).
- **APP_HOST:** Host Next binds to (default: `127.0.0.1`; use with nginx reverse proxy).
- **NGINX_CONF_DEST:** Destination for the nginx vhost file (default: `/etc/nginx/conf.d/go-sim-frontend.conf` when nginx is installed).

The script is invoked as `deploy.sh BUCKET REGION`.

## One-time notes

- **First deploy:** Creates `/etc/systemd/system/go-sim-frontend.service`, enables and starts the service. The unit file is **not overwritten** on later deploys if it already exists; delete the unit on the instance if you need to regenerate it.
- **PM2 / ecosystem.config.js:** Still included in the tarball for local or manual PM2 use; **production EC2 deploy uses systemd**, not PM2.
- **Nginx:** Edit `scripts/nginx-go-sim-frontend.conf` in the repo (e.g. `server_name`) or override the file on the server after deploy.

## Troubleshooting

- **SSM command fails or times out:** Check SSM agent and IAM; the workflow only inspects **SSM command status**, not HTTP.
- **Build or service errors:** On EC2, read `$LOG_FILE` (default `/opt/go-sim-frontend/deploy.log`) and `journalctl -u go-sim-frontend -n 200 --no-pager`.
- **nginx errors:** Run `sudo nginx -t` and check `/var/log/nginx/error.log`.
