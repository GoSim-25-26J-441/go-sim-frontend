import { z } from "zod";

const Env = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("GO-SIM"),
  NEXT_PUBLIC_BACKEND_BASE: z.string().url().default("http://localhost:8080"),
});

export const env = Env.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_BACKEND_BASE: process.env.NEXT_PUBLIC_BACKEND_BASE,
});
