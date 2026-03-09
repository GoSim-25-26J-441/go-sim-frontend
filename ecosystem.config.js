/**
 * PM2 ecosystem config for go-sim-frontend (Next.js).
 * Run from app directory: pm2 start ecosystem.config.js
 *
 * env_file: PM2 loads .env.local (relative to cwd) and passes vars (e.g. BACKEND_BASE)
 * into the process. On EC2, deploy-ec2.sh writes .env.local from Parameter Store
 * before restarting PM2.
 */
module.exports = {
  apps: [
    {
      name: "go-sim-frontend",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      // PM2 injects these into the app process (BACKEND_BASE, etc.)
      env_file: ".env.local",
    },
  ],
};
