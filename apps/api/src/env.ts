import { z } from "zod";

const csvEmails = z
  .string()
  .default("roberto@athas.mx")
  .transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  ADMIN_EMAILS: csvEmails,
});

export const env = envSchema.parse(process.env);
