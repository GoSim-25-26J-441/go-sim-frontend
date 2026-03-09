# Deploy go-sim-frontend to EC2 with PM2

This app is deployed to an EC2 instance using GitHub Actions (build in CI), S3, and AWS SSM Run Command. The workflow runs CI (lint + build) on push/PR to main, dev, and ci; deploy runs only on push to main (or manual trigger). The build artifact and deploy script are uploaded to S3; SSM runs the script on EC2, which downloads the build from S3, installs deps, fetches .env from Parameter Store, and restarts PM2.

## Architecture

- **GitHub Actions**
  - **CI job:** On push or pull_request to main, dev, ci: checkout, `npm ci`, `npm run lint`, `npm run build`.
  - **Deploy job:** After CI, only on push to main (or workflow_dispatch). Builds the app, creates a tarball (`.next`, `public`, `package.json`, `package-lock.json`, `ecosystem.config.js`), uploads it to `s3://<DEPLOY_BUCKET>/go-sim-frontend/build.tar.gz`, uploads `scripts/deploy-ec2.sh` to `s3://<DEPLOY_BUCKET>/go-sim-frontend/scripts/deploy.sh`, then invokes SSM to run a command on EC2 that downloads the script from S3 and executes `deploy.sh BUCKET REGION`.
- **EC2:** The deploy script (run via SSM) downloads the build from S3, extracts to the app directory, runs `npm ci --omit=dev`, fetches .env from Parameter Store into `.env.local`, and restarts PM2. No git clone or build on the instance.

## Prerequisites

### EC2 instance

- **OS:** Amazon Linux 2 or Ubuntu (SSM Agent pre-installed).
- **Software:** Node.js 20+ and PM2 globally:
  ```bash
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo yum install -y nodejs   # or apt for Ubuntu
  sudo npm i -g pm2
  ```
- **App directory:** The first deploy creates `~/go-sim-frontend` (or `APP_DIR`) and extracts the build there. No need to clone the repo on EC2.
- **IAM role (instance profile):** The EC2 instance role must allow:
  - `s3:GetObject` for `arn:aws:s3:::arcfind-builds/go-sim-frontend/*` (or your bucket/path).
  - `ssm:GetParameter` for the Parameter Store path (e.g. `/go-sim-frontend/production/env`).

### AWS Parameter Store

- **Name (example):** `/go-sim-frontend/production/env`
- **Type:** SecureString
- **Value:** The entire contents of your `.env.local` file (multi-line `KEY=VALUE`), including at least:
  - `BACKEND_BASE` or `NEXT_PUBLIC_BACKEND_BASE` (URL of the backend API)
  - Any `NEXT_PUBLIC_*` and other variables required at runtime.

The deploy script writes this value to `<app-dir>/.env.local` before starting/restarting PM2.

### GitHub OIDC and IAM role

The workflow uses **GitHub OIDC** to assume an IAM role. No long-lived access keys are needed.

1. **Add GitHub as an OIDC identity provider in AWS** (once per account/region):
   - IAM → Identity providers → Add provider → OpenID Connect.
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com` (or leave default).

2. **Create an IAM role** for GitHub Actions with a trust policy that allows your repo to assume it:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
           "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/go-sim-frontend:*" }
         }
       }
     ]
   }
   ```

   Replace `YOUR_ACCOUNT_ID` and `YOUR_ORG/go-sim-frontend` with your AWS account ID and GitHub org/repo. Tighten `sub` to `repo:YOUR_ORG/go-sim-frontend:ref:refs/heads/main` if you only want the main branch to deploy.

3. **Attach an inline or managed policy** to the role with at least:
   - **SSM:** `ssm:SendCommand`, `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations` (restrict SendCommand to your instance(s) when possible).
   - **S3:** `s3:PutObject`, `s3:GetObject` for `arn:aws:s3:::arcfind-builds/go-sim-frontend/*` (or your `DEPLOY_BUCKET` path).

### GitHub secrets

In the repo **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|--------|-------------|
| `AWS_ROLE_ARN` | ARN of the IAM role that GitHub Actions assumes via OIDC (e.g. `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`). |
| `AWS_REGION` | e.g. `us-east-1`. |
| `DEPLOY_BUCKET` | S3 bucket for deploy artifacts (e.g. `arcfind-builds`). Build and script are stored under `go-sim-frontend/`. |
| `EC2_INSTANCE_ID` | Target EC2 instance ID (e.g. `i-0123456789abcdef0`). |

## How to deploy

- **Automatic:** Push (or merge) to the `main` branch. CI runs, then the deploy job builds, uploads to S3, and runs the deploy script on the instance via SSM.
- **Manual:** In the repo, go to **Actions → CI** and click **Run workflow**.

## Customizing the deploy script on EC2

Optional environment variables (set on the instance or in the SSM command):

- **APP_DIR:** App directory (default: `$HOME/go-sim-frontend`).
- **PARAM_NAME:** Parameter Store path for the .env SecureString (default: `/go-sim-frontend/production/env`).
- **PM2_APP_NAME:** PM2 process name (default: `go-sim-frontend`).

The script is invoked as `deploy.sh BUCKET REGION` (e.g. `/tmp/deploy.sh arcfind-builds us-east-1`).

## One-time PM2 setup on EC2

The first deploy creates the app directory, extracts the build, and runs `pm2 start ecosystem.config.js` if the app is not already running. After the first successful deploy:

```bash
pm2 save
pm2 startup   # follow the printed command to enable PM2 on boot
```

## Troubleshooting

- **SSM command fails or times out:** Check the instance’s SSM agent status and IAM role; ensure the GitHub OIDC role has `ssm:SendCommand` (and related permissions) and S3 access for `go-sim-frontend/*`; confirm OIDC trust/conditions match your repo and branch.
- **Build or PM2 errors:** On the EC2 instance, inspect `~/deploy.log` (or `$LOG_FILE` if set) for the deploy script output.
- **Missing env:** Confirm the Parameter Store parameter path and that the EC2 instance role has `ssm:GetParameter` for that path. Ensure the value is the full .env file content.
- **S3 access denied:** Ensure the GitHub OIDC role has `s3:PutObject`/`s3:GetObject` on the bucket path and the EC2 role has `s3:GetObject` for the same path.
