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
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CRON_ENABLED: z.coerce.boolean().default(true),
  CRON_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  CRON_TARGET_LEGISLATURE: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  FIRECRAWL_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
});

export const env = envSchema.parse(process.env);
