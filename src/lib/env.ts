import { z } from "zod";

const Env = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("GO-SIM"),
  /** When `recommended_config`, batch create-run uses that objective if your backend supports it; else omit or use default. */
  NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE: z.enum(["cpu_utilization", "recommended_config"]).optional(),
  /**
   * Browser-accessible API base (simulation, projects, etc.). Must match the backend origin users can reach.
   * Server-only Route Handlers should use `getServerBackendBase()` from `@/lib/server-backend-base` (prefers `BACKEND_BASE`).
   */
  BACKEND_BASE: z.string().url().default("http://localhost:8080"),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
});

export const env = Env.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE: process.env.NEXT_PUBLIC_BATCH_OPTIMIZATION_OBJECTIVE as
    | "cpu_utilization"
    | "recommended_config"
    | undefined,
  BACKEND_BASE: process.env.NEXT_PUBLIC_BACKEND_BASE,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
