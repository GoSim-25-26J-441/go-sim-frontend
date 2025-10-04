import { z } from "zod";

const Env = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Microservice Simulator"),
  BACKEND_BASE_URL: z.string().url(),
});
export const env = Env.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  BACKEND_BASE_URL: process.env.BACKEND_BASE_URL,
});
