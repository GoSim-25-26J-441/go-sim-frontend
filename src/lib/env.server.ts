import { z } from "zod";

export const env = z.object({
  BACKEND_BASE_URL: z.string().url(),
  DESIGN_INPUT_API_KEY: z.string().min(1),
}).parse(process.env);
