import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import { env } from "./env";
import { auth } from "./lib/auth";
import { installConsoleBridge, logger } from "./lib/logger";
import {
  cleanupInvalidGroups,
  createDocumentSnapshot,
  createSessionDocumentSnapshot,
  discoverAndParsePeriod,
  discoverAndPersistPeriod,
  extractAndPersistSessionDocument,
  getAnalyticsOverview,
  getLatestPeriod,
  getLegislatorAttendanceHistory,
  getLegislatorById,
  getLegislatorTrend,
  getPersonAttendanceHistory,
  getPersonById,
  getPersonTrend,
  getPartyTrends,
  getQualityOverview,
  getAdminSessionInspection,
  getSessionComposition,
  getSessionsWithParsedAttendance,
  listDocumentSnapshots,
  listIngestAnomalies,
  listLegislators,
  listPeople,
  listPeriods,
  listPartyAnalytics,
  listSessionQuality,
  listStoredPeriods,
  listStoredDocuments,
  listStoredSessions,
  parseAttendanceDocumentsForPeriod,
  parseAndPersistAttendanceDocument,
  processPeriodPipeline,
  processAllPeriodsPipeline,
  reconcilePeriodAbsences,
  reconcileSessionAbsences,
  updateLegislatorProfile,
} from "./modules/attendance/service";
import {
  enqueueProcessAllPeriodsJob,
  enqueueProcessPeriodJob,
  getJobById,
  listJobs,
  startBackgroundServices,
} from "./modules/jobs/service";

interface Variables {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
}

const app = new Hono<{ Variables: Variables }>();
const adminEmails = new Set(env.ADMIN_EMAILS);
const signUpSchema = z.object({
  email: z.string().email(),
});

const requireAuth: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  const session = c.get("session");

  if (!user || !session) {
    return c.json({ error: "Authentication required." }, 401);
  }

  await next();
};

const requireAdmin: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const user = c.get("user");
  const session = c.get("session");

  if (!user || !session) {
    return c.json({ error: "Authentication required." }, 401);
  }

  const email = user.email?.toLowerCase();
  if (!email || !adminEmails.has(email)) {
    return c.json({ error: "Admin access required." }, 403);
  }

  await next();
};

app.use(
  "*",
  cors({
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    credentials: true,
    origin: env.CORS_ORIGIN,
  }),
);

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();

  logger.info(
    {
      durationMs: Date.now() - startedAt,
      method: c.req.method,
      path: c.req.path,
      requestId,
      status: c.res.status,
      userEmail: session?.user?.email ?? null,
    },
    "HTTP request",
  );
});

app.get("/health", (c) =>
  c.json({
    now: new Date().toISOString(),
    ok: true,
    service: "gaceta-attendance-api",
  }),
);

app.get("/api/periods", async (c) => c.json(await listPeriods()));

app.get("/api/periods/latest", async (c) => c.json(await getLatestPeriod()));

app.get("/api/stored-periods", async (c) => c.json(await listStoredPeriods()));

app.get("/api/sessions", async (c) => c.json(await listStoredSessions()));

app.get("/api/sessions/parsed", async (c) => c.json(await getSessionsWithParsedAttendance()));

app.get("/api/documents", async (c) => c.json(await listStoredDocuments()));

app.get("/api/documents/:id/snapshots", async (c) => {
  try {
    return c.json(await listDocumentSnapshots(c.req.param("id")));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});

app.post("/api/documents/:id/snapshot", requireAdmin, async (c) => {
  try {
    return c.json(await createDocumentSnapshot(c.req.param("id")), 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown snapshot error",
      },
      400,
    );
  }
});

app.get("/api/legislators", async (c) => {
  const search = c.req.query("q");
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  const sort =
    (c.req.query("sort") as
      | "name"
      | "attendance_ratio"
      | "attendance_count"
      | "absence_count"
      | "justified_absence_count"
      | "sessions_mentioned"
      | undefined) ?? "name";
  const order = (c.req.query("order") as "asc" | "desc" | undefined) ?? "asc";

  return c.json(await listLegislators(search, { legislature, periodId }, sort, order));
});

app.get("/api/legislators/:id", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(await getLegislatorById(c.req.param("id"), { legislature, periodId }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/legislators/:id/attendance", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(
      await getLegislatorAttendanceHistory(c.req.param("id"), { legislature, periodId }),
    );
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/people", async (c) => {
  const q = c.req.query("q");
  const legislature = c.req.query("legislature");
  const page = c.req.query("page");
  const pageSize = c.req.query("pageSize");

  return c.json(
    await listPeople({
      legislature,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search: q,
    }),
  );
});

app.get("/api/people/:id", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(await getPersonById(c.req.param("id"), { legislature, periodId }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/people/:id/attendance", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(await getPersonAttendanceHistory(c.req.param("id"), { legislature, periodId }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/analytics/overview", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  const includePermanent = c.req.query("includePermanent") === "true";
  return c.json(await getAnalyticsOverview({ includePermanent, legislature, periodId }));
});

app.get("/api/analytics/parties", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  const includePermanent = c.req.query("includePermanent") === "true";
  const order = (c.req.query("order") as "asc" | "desc" | undefined) ?? "desc";
  return c.json(await listPartyAnalytics({ includePermanent, legislature, periodId }, order));
});

app.get("/api/analytics/trends/parties", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  const includePermanent = c.req.query("includePermanent") === "true";
  return c.json(await getPartyTrends({ includePermanent, legislature, periodId }));
});

app.get("/api/analytics/trends/legislator/:id", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(await getLegislatorTrend(c.req.param("id"), { legislature, periodId }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/analytics/trends/person/:id", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");

  try {
    return c.json(await getPersonTrend(c.req.param("id"), { legislature, periodId }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/analytics/sessions/:id/composition", async (c) => {
  try {
    return c.json(await getSessionComposition(c.req.param("id")));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/analytics/quality", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  return c.json(await getQualityOverview({ legislature, periodId }));
});

app.get("/api/analytics/session-quality", async (c) => {
  const legislature = c.req.query("legislature");
  const periodId = c.req.query("periodId");
  return c.json(await listSessionQuality({ legislature, periodId }));
});

app.post("/api/crawl/discover", requireAdmin, async (c) => {
  const body = await c.req.json<{ periodPageUrl?: string }>();
  if (!body.periodPageUrl) {
    return c.json({ error: "periodPageUrl is required" }, 400);
  }

  try {
    const result = await discoverAndPersistPeriod(body.periodPageUrl);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown discovery error",
      },
      400,
    );
  }
});

app.post("/api/crawl/discover-and-parse-period", requireAdmin, async (c) => {
  const body = await c.req.json<{ periodPageUrl?: string }>();
  if (!body.periodPageUrl) {
    return c.json({ error: "periodPageUrl is required" }, 400);
  }

  try {
    const result = await discoverAndParsePeriod(body.periodPageUrl);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown discover/parse error",
      },
      400,
    );
  }
});

app.post("/api/crawl/extract-session-document", requireAdmin, async (c) => {
  const body = await c.req.json<{
    sessionId?: string;
    kind?: "attendance" | "absence" | "attendance_summary" | "absence_summary";
  }>();

  if (!body.sessionId || !body.kind) {
    return c.json({ error: "sessionId and kind are required" }, 400);
  }

  try {
    const result = await extractAndPersistSessionDocument(body.sessionId, body.kind);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown extraction error",
      },
      400,
    );
  }
});

app.post("/api/crawl/snapshot-session-document", requireAdmin, async (c) => {
  const body = await c.req.json<{
    sessionId?: string;
    kind?: "attendance" | "absence" | "attendance_summary" | "absence_summary";
  }>();

  if (!body.sessionId || !body.kind) {
    return c.json({ error: "sessionId and kind are required" }, 400);
  }

  try {
    const result = await createSessionDocumentSnapshot(body.sessionId, body.kind);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown snapshot error",
      },
      400,
    );
  }
});

app.post("/api/crawl/parse-attendance-document", requireAdmin, async (c) => {
  const body = await c.req.json<{ sessionId?: string }>();

  if (!body.sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  try {
    const result = await parseAndPersistAttendanceDocument(body.sessionId);
    return c.json(result, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown parse error" }, 400);
  }
});

app.post("/api/crawl/parse-period-attendance", requireAdmin, async (c) => {
  const body = await c.req.json<{ periodId?: string }>();

  if (!body.periodId) {
    return c.json({ error: "periodId is required" }, 400);
  }

  try {
    const result = await parseAttendanceDocumentsForPeriod(body.periodId);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown batch parse error",
      },
      400,
    );
  }
});

app.post("/api/crawl/process-period", requireAdmin, async (c) => {
  const body = await c.req.json<{
    periodId?: string;
    periodPageUrl?: string;
    forceParseAll?: boolean;
  }>();

  if (!body.periodId && !body.periodPageUrl) {
    return c.json({ error: "periodId or periodPageUrl is required" }, 400);
  }

  try {
    const result = await processPeriodPipeline(body);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown process-period error",
      },
      400,
    );
  }
});

app.post("/api/crawl/reconcile-session-absences", requireAdmin, async (c) => {
  const body = await c.req.json<{ sessionId?: string }>();

  if (!body.sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  try {
    const result = await reconcileSessionAbsences(body.sessionId);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown reconciliation error",
      },
      400,
    );
  }
});

app.post("/api/crawl/reconcile-period-absences", requireAdmin, async (c) => {
  const body = await c.req.json<{ periodId?: string }>();

  if (!body.periodId) {
    return c.json({ error: "periodId is required" }, 400);
  }

  try {
    const result = await reconcilePeriodAbsences(body.periodId);
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown batch reconciliation error",
      },
      400,
    );
  }
});

app.post("/api/crawl/process-all-periods", requireAdmin, async (c) => {
  const body = await c.req.json<{
    legislature?: string;
    forceParseAll?: boolean;
  }>();

  try {
    const result = await processAllPeriodsPipeline({
      forceParseAll: body.forceParseAll,
      legislature: body.legislature,
    });
    return c.json(result, 201);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown batch process error",
      },
      400,
    );
  }
});

app.get("/api/admin/jobs", requireAdmin, async (c) => {
  const status = c.req.query("status") as
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | undefined;
  const type = c.req.query("type") as "process_period" | "process_all_periods" | undefined;

  return c.json(await listJobs({ status, type }));
});

app.get("/api/admin/jobs/:id", requireAdmin, async (c) => {
  try {
    return c.json(await getJobById(c.req.param("id")));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.get("/api/admin/anomalies", requireAdmin, async (c) => {
  const legislature = c.req.query("legislature") ?? undefined;
  const kind = c.req.query("kind") ?? undefined;
  const limit = c.req.query("limit");

  return c.json(
    await listIngestAnomalies({
      kind,
      legislature,
      limit: limit ? Number(limit) : undefined,
    }),
  );
});

app.get("/api/admin/sessions/:id/inspection", requireAdmin, async (c) => {
  try {
    return c.json(await getAdminSessionInspection(c.req.param("id")));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 404);
  }
});

app.post("/api/admin/jobs/process-period", requireAdmin, async (c) => {
  const body = await c.req.json<{
    periodId?: string;
    periodPageUrl?: string;
    forceParseAll?: boolean;
  }>();
  const user = c.get("user");

  if (!body.periodId && !body.periodPageUrl) {
    return c.json({ error: "periodId or periodPageUrl is required" }, 400);
  }

  try {
    const job = await enqueueProcessPeriodJob(body, user?.email ?? null);
    return c.json(job, 202);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown queue error" }, 400);
  }
});

app.post("/api/admin/jobs/process-all-periods", requireAdmin, async (c) => {
  const body = await c.req.json<{
    legislature?: string;
    forceParseAll?: boolean;
  }>();
  const user = c.get("user");

  try {
    const job = await enqueueProcessAllPeriodsJob(body, user?.email ?? null);
    return c.json(job, 202);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown queue error" }, 400);
  }
});

app.patch("/api/admin/legislators/:id/profile", requireAdmin, async (c) => {
  const body = await c.req.json<{
    imageUrl?: string | null;
    bio?: string | null;
  }>();

  try {
    return c.json(await updateLegislatorProfile(c.req.param("id"), body));
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown update error",
      },
      400,
    );
  }
});

app.post("/api/admin/cleanup-invalid-groups", requireAdmin, async (c) => {
  const body = await c.req.json<{ legislature?: string }>();

  try {
    const result = await cleanupInvalidGroups(body.legislature);
    return c.json(result);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown cleanup error",
      },
      500,
    );
  }
});

app.get("/api/session", requireAuth, (c) => {
  const user = c.get("user");
  const session = c.get("session");

  return c.json({ session, user });
});

app.post("/api/auth/sign-up/email", async (c) => {
  const parsed = signUpSchema.safeParse(
    await c.req.raw
      .clone()
      .json()
      .catch(() => null),
  );

  if (!parsed.success) {
    return c.json({ error: "A valid email is required." }, 400);
  }

  const email = parsed.data.email.toLowerCase();

  if (!adminEmails.has(email)) {
    return c.json({ error: "Only configured admin emails may create accounts." }, 403);
  }

  return auth.handler(c.req.raw);
});

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

Bun.serve({
  fetch: app.fetch,
  port: env.PORT,
});

installConsoleBridge();
startBackgroundServices();

console.log(`gaceta-attendance-api listening on http://localhost:${env.PORT}`);
