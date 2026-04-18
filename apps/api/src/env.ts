import { z } from "zod";

const booleanFromEnv = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", ""].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
});

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
  ADMIN_EMAILS: csvEmails,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  CRON_ENABLED: booleanFromEnv.default(true),
  CRON_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  CRON_TARGET_LEGISLATURE: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  DATABASE_URL: z.string().min(1),
  FIRECRAWL_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  JOB_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(3001),
});

export const env = envSchema.parse(process.env);
