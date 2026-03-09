const path = require("path");

/**
 * PM2 ecosystem config for go-sim-frontend (Next.js).
 * Run from app directory: pm2 start ecosystem.config.js
 *
 * env_file: absolute path so PM2 finds .env.local even when started from another cwd.
 * deploy-ec2.sh writes .env.local from Parameter Store before restarting PM2.
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
      env_file: path.join(__dirname, ".env.local"),
    },
  ],
};
