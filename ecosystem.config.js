/**
 * PM2 ecosystem config for go-sim-frontend (Next.js).
 * Run from app directory: pm2 start ecosystem.config.js
 * Next.js loads .env.local from cwd automatically when running `next start`.
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
    },
  ],
};
