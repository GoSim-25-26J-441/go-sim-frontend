# go-sim-frontend

Next.js 15 frontend for GO-SIM: project and diagram workflows, AMG-APD graph editing, and simulation run configuration (including the scenario behavior editor).

## Requirements

- Node.js 20+
- npm 10+

## Setup

```bash
npm ci
cp .env.example .env.local   # then adjust values
```

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_BACKEND_BASE` | Client + build | Public API origin (browser `fetch` / RTK Query). **Required in production** so the app can reach the backend. |
| `BACKEND_BASE` | Server (Route Handlers, `next.config` rewrites) | Preferred for server-side proxy targets. Falls back to `NEXT_PUBLIC_BACKEND_BASE` when unset. Use in CI/deploy alongside the public URL. |
| `NEXT_PUBLIC_APP_NAME` | Client | App title (optional). |
| `NEXT_PUBLIC_FIREBASE_*` | Client | Firebase Auth (optional). |
| `NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE` | Client | Batch recommendation objective hint (`cpu_utilization` \| `recommended_config`). |

Server code should use `getServerBackendBase()` from `src/lib/server-backend-base.ts` instead of duplicating `process.env` lookups. Client code uses `env` from `src/lib/env.ts` (backed by `NEXT_PUBLIC_BACKEND_BASE`).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server (Turbopack). |
| `npm run build` | Production build. |
| `npm run start` | Run production server. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript). |
| `npm test` | Vitest unit tests. |
| `npm run ci` | `typecheck` → `test` → `lint` → `build` (local/CI gate). |

## Simulation flow

1. **Diagram / AMG-APD** — Upload YAML, analyze, edit the graph; scenario drafts are tied to diagram versions.
2. **New simulation** (`/project/[id]/simulation/new`) — Step 1: **Scenario behavior** (read-only topology summary, endpoint timing/downstream parameters, workload patterns, autoscaling policies). YAML preview and backend validation live under the Debug section.
3. **Run** — Create-run uses the composed scenario YAML; review step blocks if validation is stale; invalid backend validation requires an explicit confirm before submit.

## EC2 deployment

GitHub Actions (`.github/workflows/deploy-ec2.yml`) runs `npm ci`, typecheck, tests, lint, and build, then uploads the artifact to S3 and triggers an SSM deploy script on the instance.

- Script: `scripts/deploy-ec2.sh`
- Notes: `docs/deploy-ec2.md`

Required secrets (see workflow file): AWS role, region, deploy bucket, EC2 instance id, and the same `NEXT_PUBLIC_*` / `BACKEND_BASE` values used for build.

## Lint / type debt

- **TypeScript** is the strict gate (`npm run typecheck`); `next build` runs typechecking.
- **ESLint**: `@typescript-eslint/no-explicit-any`, `react/no-unescaped-entities`, and `prefer-const` are set to **warn** in `eslint.config.mjs` so CI can run `npm run lint` without failing on ~160+ legacy issues. New code should still avoid unnecessary `any`.
- Remaining warnings (unused vars, hook deps, `any`, etc.) should be reduced over time.
