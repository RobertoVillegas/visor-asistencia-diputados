import { and, asc, count, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";

import { db } from "../../db";
import {
  attendanceRecords,
  documentSnapshots,
  documentParseRuns,
  ingestAnomalies,
  legislativePeriods,
  legislators,
  people,
  parliamentaryGroups,
  sessionReconciliations,
  sessionDocuments,
  sessionGroupSummaries,
  sessions,
} from "../../db/schema";
import type { documentKindEnum } from "../../db/schema";
import { logger } from "../../lib/logger";
import {
  fetchAttendancePeriods,
  fetchSessionDetails,
  fetchSessionsFromPeriod,
  pickLatestPeriod,
} from "../gaceta/client";
import { KNOWN_GROUP_CODES, normalizeName, parseAttendancePages } from "./parser";
import type { ParsedAttendanceDocument } from "./parser";
import { extractPdfTextFromBytes, extractPdfTextFromUrl, fetchPdfFromUrl } from "../pdf/extractor";
import { parseAbsencePages } from "./absence-parser";

type DocumentKind = (typeof documentKindEnum.enumValues)[number];
type SessionType = (typeof sessions.$inferInsert)["sessionType"];
interface AnalyticsScope {
  legislature?: string;
  periodId?: string;
  includePermanent?: boolean;
}

const ATTENDANCE_PARSER_VERSION = "attendance-v2";

type LegislatorSort =
  | "name"
  | "attendance_ratio"
  | "attendance_count"
  | "absence_count"
  | "justified_absence_count"
  | "sessions_mentioned";

type SortOrder = "asc" | "desc";

function toDocumentKind(kind: "attendance" | "absence"): DocumentKind {
  return kind === "attendance" ? "attendance" : "absence";
}

function inferLegislatureFromSessionUrl(sessionPageUrl: string): string {
  const match = sessionPageUrl.match(/\/Gaceta\/(\d+)\//);
  const code = match?.[1];

  if (code === "66") {
    return "LXVI";
  }
  if (code === "65") {
    return "LXV";
  }
  if (code === "64") {
    return "LXIV";
  }
  if (code === "63") {
    return "LXIII";
  }
  if (code === "62") {
    return "LXII";
  }
  if (code === "61") {
    return "LXI";
  }
  if (code === "60") {
    return "LX";
  }
  if (code === "59") {
    return "LIX";
  }
  return "UNKNOWN";
}

function formatGroupName(code: string): string {
  if (code === "MORENA") {
    return "Movimiento Regeneración Nacional";
  }
  if (code === "PAN") {
    return "Partido Acción Nacional";
  }
  if (code === "PVEM") {
    return "Partido Verde Ecologista de México";
  }
  if (code === "PT") {
    return "Partido del Trabajo";
  }
  if (code === "PRI") {
    return "Partido Revolucionario Institucional";
  }
  if (code === "PRD") {
    return "Partido de la Revolución Democrática";
  }
  if (code === "MC") {
    return "Movimiento Ciudadano";
  }
  if (code === "IND") {
    return "Independiente";
  }
  return code;
}

function stripAccents(value: string) {
  return value.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
}

function inferSessionTypeFromAttendanceSource(input: {
  sessionPageUrl: string;
  title: string;
  rawText: string;
  currentSessionType: SessionType;
}): SessionType {
  const source = stripAccents(
    `${input.sessionPageUrl} ${input.title} ${input.rawText.slice(0, 400)}`,
  ).toLowerCase();

  if (
    source.includes("-cp-") ||
    source.includes("asistenciasp") ||
    source.includes("comision permanente")
  ) {
    return "permanent";
  }
  if (
    source.includes("-v-") ||
    source.includes("sesion de votacion") ||
    source.includes("sesion de votación")
  ) {
    return "vote";
  }
  if (
    source.includes("-s-") ||
    source.includes("sesion solemne") ||
    source.includes("sesion especial")
  ) {
    return "special";
  }
  if (source.includes("sesion ordinaria")) {
    return "ordinary";
  }

  return input.currentSessionType ?? "unknown";
}

type AttendanceAnomalyInsert = typeof ingestAnomalies.$inferInsert;

function buildAttendanceParseAnomalies(
  parsed: ParsedAttendanceDocument,
  ctx: {
    sessionId: string;
    documentId: string;
    parseRunId: string;
    sourceUrl: string;
  },
): AttendanceAnomalyInsert[] {
  const rows: AttendanceAnomalyInsert[] = [];
  const seen = new Set<string>();
  const push = (
    kind: string,
    message: string,
    snippet?: string | null,
    metadata?: Record<string, unknown> | null,
  ) => {
    const key = `${kind}:${snippet ?? message}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    if (rows.length >= 200) {
      return;
    }
    rows.push({
      documentId: ctx.documentId,
      kind,
      message,
      metadata: metadata ?? undefined,
      parseRunId: ctx.parseRunId,
      sessionId: ctx.sessionId,
      snippet: snippet ?? undefined,
      sourceUrl: ctx.sourceUrl,
    });
  };

  if (parsed.parserPath === "compressed") {
    push("compressed_format", "Se usó el parser compacto de Comisión Permanente.", null, {
      parserPath: parsed.parserPath,
    });
  }

  for (const record of parsed.records) {
    if (record.status === "unknown") {
      push(
        "unknown_status",
        `Estatus no reconocido: «${record.rawStatus}»`,
        `${record.rawName} — ${record.rawStatus}`,
        { rawStatus: record.rawStatus },
      );
    }
    if (!KNOWN_GROUP_CODES.has(record.groupCode)) {
      push("unknown_group", `Grupo no catalogado (${record.groupCode})`, record.groupName, {
        groupCode: record.groupCode,
        groupName: record.groupName,
      });
    }
  }

  return rows;
}

export async function listPeriods() {
  return fetchAttendancePeriods();
}

export async function getLatestPeriod() {
  const remotePeriods = await fetchAttendancePeriods();
  const latest = pickLatestPeriod(remotePeriods);

  if (!latest) {
    return { latest: null, stored: null };
  }

  const [stored] = await db
    .select()
    .from(legislativePeriods)
    .where(eq(legislativePeriods.periodPageUrl, latest.periodPageUrl))
    .limit(1);

  return {
    latest,
    stored: stored ?? null,
  };
}

export async function listStoredPeriods() {
  return db.select().from(legislativePeriods).orderBy(desc(legislativePeriods.discoveredAt));
}

export async function discoverAndPersistPeriod(periodPageUrl: string) {
  const remotePeriods = await fetchAttendancePeriods();
  const remotePeriod = remotePeriods.find((period) => period.periodPageUrl === periodPageUrl);

  if (!remotePeriod) {
    throw new Error("The provided period URL was not found in gp_asistencias.html");
  }

  const [periodRecord] = await db
    .insert(legislativePeriods)
    .values(remotePeriod)
    .onConflictDoUpdate({
      set: {
        label: remotePeriod.label,
        legislature: remotePeriod.legislature,
        yearSpan: remotePeriod.yearSpan,
      },
      target: legislativePeriods.periodPageUrl,
    })
    .returning();

  const sessionUrls = await fetchSessionsFromPeriod(periodPageUrl);
  const persistedSessions = [];

  for (const sessionUrl of sessionUrls) {
    const details = await fetchSessionDetails(sessionUrl);

    const [sessionRecord] = await db
      .insert(sessions)
      .values({
        gacetaNumber: details.gacetaNumber,
        metadata: {
          documents: details.documents,
        },
        periodId: periodRecord.id,
        sessionDate: details.sessionDate,
        sessionPageUrl: details.sessionPageUrl,
        sessionType: details.sessionType,
        sourceSlug: details.sourceSlug,
        title: details.title,
      })
      .onConflictDoUpdate({
        set: {
          gacetaNumber: details.gacetaNumber,
          metadata: {
            documents: details.documents,
          },
          periodId: periodRecord.id,
          sessionDate: details.sessionDate,
          sessionType: details.sessionType,
          sourceSlug: details.sourceSlug,
          title: details.title,
          updatedAt: new Date(),
        },
        target: sessions.sessionPageUrl,
      })
      .returning();

    for (const document of details.documents) {
      await db
        .insert(sessionDocuments)
        .values({
          kind: toDocumentKind(document.kind),
          sessionId: sessionRecord.id,
          url: document.url,
        })
        .onConflictDoUpdate({
          set: {
            url: document.url,
          },
          target: [sessionDocuments.sessionId, sessionDocuments.kind],
        });
    }

    persistedSessions.push(sessionRecord);
  }

  return {
    discoveredSessionCount: sessionUrls.length,
    period: periodRecord,
    persistedSessions,
  };
}

export async function discoverAndParsePeriod(periodPageUrl: string) {
  const discovery = await discoverAndPersistPeriod(periodPageUrl);
  const parsed = await parseAttendanceDocumentsForPeriod(discovery.period.id);

  return {
    discovery: {
      discoveredSessionCount: discovery.discoveredSessionCount,
      period: discovery.period,
    },
    parsed,
  };
}

async function getSessionDocument(sessionId: string, kind: DocumentKind) {
  const [row] = await db
    .select({
      document: sessionDocuments,
      period: legislativePeriods,
      session: sessions,
    })
    .from(sessionDocuments)
    .innerJoin(sessions, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(and(eq(sessionDocuments.sessionId, sessionId), eq(sessionDocuments.kind, kind)))
    .limit(1);

  return row;
}

export async function extractAndPersistSessionDocument(sessionId: string, kind: DocumentKind) {
  const row = await getSessionDocument(sessionId, kind);

  if (!row) {
    throw new Error("Session document not found.");
  }

  const extracted = await extractPdfTextFromUrl(row.document.url);

  const [updated] = await db
    .update(sessionDocuments)
    .set({
      extractedAt: new Date(),
      extractionMeta: {
        extractor: "unpdf",
        pages: extracted.pages.length,
      },
      pageCount: extracted.pageCount,
      rawText: extracted.rawText,
    })
    .where(eq(sessionDocuments.id, row.document.id))
    .returning();

  if (kind === "attendance") {
    const inferredSessionType = inferSessionTypeFromAttendanceSource({
      currentSessionType: row.session.sessionType,
      rawText: extracted.rawText,
      sessionPageUrl: row.session.sessionPageUrl,
      title: row.session.title,
    });

    if (inferredSessionType !== row.session.sessionType) {
      await db
        .update(sessions)
        .set({
          sessionType: inferredSessionType,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, row.session.id));
    }
  }

  return {
    ...updated,
    pages: extracted.pages.length,
  };
}

async function createDocumentSnapshotForRow(documentId: string, url: string) {
  const [previousSnapshot] = await db
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.fetchedAt))
    .limit(1);

  const fetchedAt = new Date();

  try {
    const fetched = await fetchPdfFromUrl(url);
    const changed = previousSnapshot?.contentHash !== fetched.contentHash;
    const status = previousSnapshot ? (changed ? "changed" : "unchanged") : "fetched";

    const [snapshot] = await db
      .insert(documentSnapshots)
      .values({
        byteSize: fetched.byteSize,
        changedAt: changed || !previousSnapshot ? fetchedAt : null,
        contentHash: fetched.contentHash,
        contentType: fetched.contentType,
        documentId,
        etag: fetched.etag,
        fetchedAt,
        httpStatus: fetched.httpStatus,
        lastModified: fetched.lastModified,
        metadata: {
          comparedToSnapshotId: previousSnapshot?.id ?? null,
        },
        previousSnapshotId: previousSnapshot?.id ?? null,
        sourceUrl: url,
        status,
      })
      .returning();

    await db
      .update(sessionDocuments)
      .set({
        lastChangedAt:
          changed || !previousSnapshot ? fetchedAt : (previousSnapshot?.changedAt ?? null),
        lastCheckedAt: fetchedAt,
        latestContentHash: fetched.contentHash,
      })
      .where(eq(sessionDocuments.id, documentId));

    return {
      changed,
      fetched,
      previousSnapshot,
      snapshot,
    };
  } catch (error) {
    const [snapshot] = await db
      .insert(documentSnapshots)
      .values({
        documentId,
        fetchedAt,
        httpStatus: null,
        metadata: {
          comparedToSnapshotId: previousSnapshot?.id ?? null,
          errorMessage: error instanceof Error ? error.message : "Unknown fetch error",
        },
        previousSnapshotId: previousSnapshot?.id ?? null,
        sourceUrl: url,
        status: "failed",
      })
      .returning();

    await db
      .update(sessionDocuments)
      .set({
        lastCheckedAt: fetchedAt,
      })
      .where(eq(sessionDocuments.id, documentId));

    throw Object.assign(new Error("Failed to create document snapshot."), {
      cause: error,
      snapshotId: snapshot.id,
    });
  }
}

export async function createDocumentSnapshot(documentId: string) {
  const [document] = await db
    .select()
    .from(sessionDocuments)
    .where(eq(sessionDocuments.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error("Document not found.");
  }

  const result = await createDocumentSnapshotForRow(document.id, document.url);

  return {
    changed: result.changed,
    documentId: document.id,
    fetchedAt: result.snapshot.fetchedAt,
    latestHash: result.snapshot.contentHash,
    previousHash: result.previousSnapshot?.contentHash ?? null,
    status: result.snapshot.status,
  };
}

export async function createSessionDocumentSnapshot(sessionId: string, kind: DocumentKind) {
  const row = await getSessionDocument(sessionId, kind);

  if (!row) {
    throw new Error("Session document not found.");
  }

  return createDocumentSnapshot(row.document.id);
}

export async function listDocumentSnapshots(documentId: string) {
  return db
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.fetchedAt));
}

export async function parseAttendanceDocumentsForPeriod(periodId: string) {
  const rows = await db
    .select({
      documentId: sessionDocuments.id,
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      title: sessions.title,
    })
    .from(sessions)
    .innerJoin(
      sessionDocuments,
      and(eq(sessionDocuments.sessionId, sessions.id), eq(sessionDocuments.kind, "attendance")),
    )
    .where(eq(sessions.periodId, periodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title));

  const results: Record<string, unknown>[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const row of rows) {
    try {
      const parsed = await parseAndPersistAttendanceDocument(row.sessionId);
      successCount += 1;
      results.push({
        sessionDate: row.sessionDate,
        sessionId: row.sessionId,
        sessionType: row.sessionType,
        status: "parsed",
        title: row.title,
        ...parsed,
      });
    } catch (error) {
      failureCount += 1;
      results.push({
        error: error instanceof Error ? error.message : "Unknown parse error",
        sessionDate: row.sessionDate,
        sessionId: row.sessionId,
        sessionType: row.sessionType,
        status: "failed",
        title: row.title,
      });
    }
  }

  return {
    failureCount,
    periodId,
    results,
    successCount,
    totalSessions: rows.length,
  };
}

export async function reconcileSessionAbsences(sessionId: string) {
  const attendanceRow = await getSessionDocument(sessionId, "attendance");
  const absenceRow = await getSessionDocument(sessionId, "absence");

  if (!absenceRow) {
    throw new Error("Absence document not found for the provided session.");
  }

  const parsedAttendanceAbsences = await db
    .select({
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      normalizedName: attendanceRecords.normalizedName,
      rawName: attendanceRecords.rawName,
    })
    .from(attendanceRecords)
    .leftJoin(parliamentaryGroups, eq(attendanceRecords.groupId, parliamentaryGroups.id))
    .where(
      and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.status, "absence")),
    );

  const fetched = await fetchPdfFromUrl(absenceRow.document.url);
  const extracted = await extractPdfTextFromBytes(fetched.bytes);
  const parsedAbsences = parseAbsencePages(extracted.pages);

  const attendanceByName = new Map(
    parsedAttendanceAbsences.map((record) => [record.normalizedName, record]),
  );
  const absenceByName = new Map(
    parsedAbsences.records.map((record) => [record.normalizedName, record]),
  );

  const missingFromAttendance = parsedAbsences.records
    .filter((record) => !attendanceByName.has(record.normalizedName))
    .map((record) => ({
      groupCode: record.groupCode,
      groupName: record.groupName,
      normalizedName: record.normalizedName,
      rawName: record.rawName,
    }));

  const extraInAttendance = parsedAttendanceAbsences
    .filter((record) => !absenceByName.has(record.normalizedName))
    .map((record) => ({
      groupCode: record.groupCode,
      groupName: record.groupName,
      normalizedName: record.normalizedName,
      rawName: record.rawName,
    }));

  const attendanceCounts = new Map<string, number>();
  for (const record of parsedAttendanceAbsences) {
    const code = record.groupCode ?? "UNKNOWN";
    attendanceCounts.set(code, (attendanceCounts.get(code) ?? 0) + 1);
  }

  const absenceCounts = new Map(
    parsedAbsences.summaries.map((summary) => [summary.groupCode, summary.absenceCount]),
  );
  const allGroupCodes = new Set([...attendanceCounts.keys(), ...absenceCounts.keys()]);

  const groupDiffs = [...allGroupCodes]
    .map((groupCode) => ({
      absencePdfCount: absenceCounts.get(groupCode) ?? 0,
      attendanceAbsenceCount: attendanceCounts.get(groupCode) ?? 0,
      difference: (attendanceCounts.get(groupCode) ?? 0) - (absenceCounts.get(groupCode) ?? 0),
      groupCode,
    }))
    .toSorted((a, b) => a.groupCode.localeCompare(b.groupCode));

  const result = {
    absenceDocumentId: absenceRow.document.id,
    absencePdfCount: parsedAbsences.records.length,
    absenceSnapshotHash: fetched.contentHash,
    attendanceAbsenceCount: parsedAttendanceAbsences.length,
    attendanceDocumentId: attendanceRow?.document.id ?? null,
    attendanceSnapshotHash: attendanceRow?.document.latestContentHash ?? null,
    extraInAttendance,
    groupDiffs,
    matches: missingFromAttendance.length === 0 && extraInAttendance.length === 0,
    missingFromAttendance,
    sessionDate: absenceRow.session.sessionDate,
    sessionId,
    sessionType: absenceRow.session.sessionType,
    title: absenceRow.session.title,
  };

  await db
    .insert(sessionReconciliations)
    .values({
      absenceDocumentId: absenceRow.document.id,
      absencePdfCount: result.absencePdfCount,
      absenceSnapshotHash: fetched.contentHash,
      attendanceAbsenceCount: result.attendanceAbsenceCount,
      attendanceDocumentId: attendanceRow?.document.id ?? null,
      attendanceSnapshotHash: attendanceRow?.document.latestContentHash ?? null,
      details: {
        extraInAttendance: result.extraInAttendance,
        groupDiffs: result.groupDiffs,
        missingFromAttendance: result.missingFromAttendance,
      },
      extraInAttendanceCount: result.extraInAttendance.length,
      groupDiffCount: result.groupDiffs.filter((diff) => diff.difference !== 0).length,
      matches: result.matches ? "true" : "false",
      missingFromAttendanceCount: result.missingFromAttendance.length,
      reconciledAt: new Date(),
      sessionId,
    })
    .onConflictDoUpdate({
      set: {
        absenceDocumentId: absenceRow.document.id,
        absencePdfCount: result.absencePdfCount,
        absenceSnapshotHash: fetched.contentHash,
        attendanceAbsenceCount: result.attendanceAbsenceCount,
        attendanceDocumentId: attendanceRow?.document.id ?? null,
        attendanceSnapshotHash: attendanceRow?.document.latestContentHash ?? null,
        details: {
          extraInAttendance: result.extraInAttendance,
          groupDiffs: result.groupDiffs,
          missingFromAttendance: result.missingFromAttendance,
        },
        extraInAttendanceCount: result.extraInAttendance.length,
        groupDiffCount: result.groupDiffs.filter((diff) => diff.difference !== 0).length,
        matches: result.matches ? "true" : "false",
        missingFromAttendanceCount: result.missingFromAttendance.length,
        reconciledAt: new Date(),
      },
      target: sessionReconciliations.sessionId,
    });

  return result;
}

export async function reconcilePeriodAbsences(periodId: string) {
  const periodSessions = await db
    .select({
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      title: sessions.title,
    })
    .from(sessions)
    .innerJoin(
      sessionDocuments,
      and(eq(sessionDocuments.sessionId, sessions.id), eq(sessionDocuments.kind, "absence")),
    )
    .where(eq(sessions.periodId, periodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title));

  const results: Record<string, unknown>[] = [];
  let matchedSessions = 0;
  let mismatchedSessions = 0;
  let failedSessions = 0;

  for (const session of periodSessions) {
    try {
      const result = await reconcileSessionAbsences(session.sessionId);
      if (result.matches) {
        matchedSessions += 1;
      } else {
        mismatchedSessions += 1;
      }
      results.push(result);
    } catch (error) {
      failedSessions += 1;
      results.push({
        error: error instanceof Error ? error.message : "Unknown reconciliation error",
        sessionDate: session.sessionDate,
        sessionId: session.sessionId,
        title: session.title,
      });
    }
  }

  return {
    failedSessions,
    matchedSessions,
    mismatchedSessions,
    periodId,
    results,
    totalSessions: periodSessions.length,
  };
}

export async function processPeriodPipeline(input: {
  periodId?: string;
  periodPageUrl?: string;
  forceParseAll?: boolean;
  onProgress?: (progress: Record<string, unknown>) => Promise<void> | void;
}) {
  let targetPeriodId = input.periodId;
  let discoveredSessionCount = 0;
  let periodInfo:
    | {
        id: string;
        label: string;
        legislature: string;
        yearSpan: string;
        periodPageUrl: string;
      }
    | undefined;

  if (input.periodPageUrl) {
    const discovery = await discoverAndPersistPeriod(input.periodPageUrl);
    targetPeriodId = discovery.period.id;
    ({ discoveredSessionCount } = discovery);
    periodInfo = discovery.period;
  }

  if (!targetPeriodId) {
    throw new Error("periodId or periodPageUrl is required.");
  }

  if (!periodInfo) {
    const [storedPeriod] = await db
      .select()
      .from(legislativePeriods)
      .where(eq(legislativePeriods.id, targetPeriodId))
      .limit(1);

    if (!storedPeriod) {
      throw new Error("Period not found.");
    }

    periodInfo = storedPeriod;
  }

  const periodSessions = await db
    .select({
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      title: sessions.title,
    })
    .from(sessions)
    .where(eq(sessions.periodId, targetPeriodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title));

  const results: Record<string, unknown>[] = [];
  let attendanceSnapshotsCreated = 0;
  let absenceSnapshotsCreated = 0;
  let parsedSessions = 0;
  let skippedParses = 0;
  let reconciledSessions = 0;
  let reconciliationMismatches = 0;
  let failedSessions = 0;

  for (const session of periodSessions) {
    const sessionStartedAt = Date.now();
    const sessionResult: Record<string, unknown> = {
      sessionDate: session.sessionDate,
      sessionId: session.sessionId,
      sessionType: session.sessionType,
      title: session.title,
    };

    const emitProgress = async (
      stage:
        | "session"
        | "attendance_document_lookup"
        | "attendance_snapshot"
        | "attendance_parse"
        | "absence_snapshot"
        | "reconciliation"
        | "session_completed"
        | "session_failed",
      extra?: Record<string, unknown>,
    ) => {
      await input.onProgress?.({
        current: results.length + 1,
        sessionId: session.sessionId,
        stage,
        title: session.title,
        total: periodSessions.length,
        ...extra,
      });
    };

    try {
      logger.info(
        {
          periodId: targetPeriodId,
          sessionId: session.sessionId,
          sessionTitle: session.title,
        },
        "Processing session in attendance pipeline",
      );
      await emitProgress("session");
      await emitProgress("attendance_document_lookup");

      const attendanceDocument = await getSessionDocument(session.sessionId, "attendance");
      const absenceDocument = await getSessionDocument(session.sessionId, "absence");

      let attendanceSnapshotChanged = false;
      let hasParsedAttendance = false;

      if (attendanceDocument) {
        await emitProgress("attendance_snapshot", {
          attendanceDocumentId: attendanceDocument.document.id,
          attendanceDocumentUrl: attendanceDocument.document.url,
        });
        const attendanceSnapshot = await createDocumentSnapshotForRow(
          attendanceDocument.document.id,
          attendanceDocument.document.url,
        );
        attendanceSnapshotsCreated += 1;
        attendanceSnapshotChanged = attendanceSnapshot.changed;
        sessionResult.attendanceSnapshot = {
          changed: attendanceSnapshot.changed,
          contentHash: attendanceSnapshot.snapshot.contentHash,
          documentId: attendanceDocument.document.id,
          status: attendanceSnapshot.snapshot.status,
        };

        const [existingParsed] = await db
          .select({ count: count(attendanceRecords.id) })
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, session.sessionId));

        hasParsedAttendance = Number(existingParsed?.count ?? 0) > 0;

        if (input.forceParseAll || attendanceSnapshotChanged || !hasParsedAttendance) {
          await emitProgress("attendance_parse", {
            attendanceDocumentId: attendanceDocument.document.id,
            snapshotChanged: attendanceSnapshotChanged,
          });
          const parsed = await parseAndPersistAttendanceDocument(session.sessionId);
          parsedSessions += 1;
          sessionResult.parse = {
            status: "parsed",
            ...parsed,
          };
          hasParsedAttendance = true;
        } else {
          skippedParses += 1;
          sessionResult.parse = {
            reason: "unchanged_snapshot_with_existing_parsed_rows",
            status: "skipped",
          };
        }
      } else {
        sessionResult.parse = {
          reason: "missing_attendance_document",
          status: "skipped",
        };
      }

      if (absenceDocument) {
        await emitProgress("absence_snapshot", {
          absenceDocumentId: absenceDocument.document.id,
          absenceDocumentUrl: absenceDocument.document.url,
        });
        const absenceSnapshot = await createDocumentSnapshotForRow(
          absenceDocument.document.id,
          absenceDocument.document.url,
        );
        absenceSnapshotsCreated += 1;
        sessionResult.absenceSnapshot = {
          changed: absenceSnapshot.changed,
          contentHash: absenceSnapshot.snapshot.contentHash,
          documentId: absenceDocument.document.id,
          status: absenceSnapshot.snapshot.status,
        };
      }

      if (absenceDocument && hasParsedAttendance) {
        await emitProgress("reconciliation", {
          absenceDocumentId: absenceDocument.document.id,
        });
        const reconciliation = await reconcileSessionAbsences(session.sessionId);
        reconciledSessions += 1;
        if (!reconciliation.matches) {
          reconciliationMismatches += 1;
        }
        sessionResult.reconciliation = {
          absencePdfCount: reconciliation.absencePdfCount,
          attendanceAbsenceCount: reconciliation.attendanceAbsenceCount,
          extraInAttendanceCount: reconciliation.extraInAttendance.length,
          groupDiffs: reconciliation.groupDiffs,
          matches: reconciliation.matches,
          missingFromAttendanceCount: reconciliation.missingFromAttendance.length,
        };
      } else {
        sessionResult.reconciliation = {
          reason: absenceDocument ? "attendance_not_parsed" : "missing_absence_document",
          status: "skipped",
        };
      }

      const durationMs = Date.now() - sessionStartedAt;
      await emitProgress("session_completed", {
        durationMs,
      });
      logger.info(
        {
          durationMs,
          periodId: targetPeriodId,
          sessionId: session.sessionId,
          sessionTitle: session.title,
        },
        "Completed session in attendance pipeline",
      );
      results.push(sessionResult);
    } catch (error) {
      failedSessions += 1;
      const message = error instanceof Error ? error.message : "Unknown pipeline error";
      const durationMs = Date.now() - sessionStartedAt;
      await emitProgress("session_failed", {
        durationMs,
        error: message,
      });
      logger.error(
        {
          durationMs,
          error: message,
          periodId: targetPeriodId,
          sessionId: session.sessionId,
          sessionTitle: session.title,
        },
        "Session processing failed in attendance pipeline",
      );
      results.push({
        ...sessionResult,
        error: message,
      });
    }
  }

  return {
    absenceSnapshotsCreated,
    attendanceSnapshotsCreated,
    discoveredSessionCount,
    failedSessions,
    parsedSessions,
    period: periodInfo,
    reconciledSessions,
    reconciliationMismatches,
    results,
    skippedParses,
    totalSessions: periodSessions.length,
  };
}

export async function processAllPeriodsPipeline(input: {
  legislature?: string;
  forceParseAll?: boolean;
  onProgress?: (progress: Record<string, unknown>) => Promise<void> | void;
}) {
  const remotePeriods = await fetchAttendancePeriods();
  const targetPeriods = input.legislature
    ? remotePeriods.filter((period) => period.legislature === input.legislature)
    : remotePeriods;

  const results: Record<string, unknown>[] = [];
  let processedPeriods = 0;
  let failedPeriods = 0;

  for (const period of targetPeriods) {
    try {
      await input.onProgress?.({
        current: results.length + 1,
        label: period.label,
        legislature: period.legislature,
        periodPageUrl: period.periodPageUrl,
        stage: "period",
        total: targetPeriods.length,
      });

      const result = await processPeriodPipeline({
        forceParseAll: input.forceParseAll,
        onProgress: async (progress) => {
          await input.onProgress?.({
            ...progress,
            outerCurrent: results.length + 1,
            outerLegislature: period.legislature,
            outerPeriodLabel: period.label,
            outerTotal: targetPeriods.length,
          });
        },
        periodPageUrl: period.periodPageUrl,
      });

      processedPeriods += 1;
      results.push(result);
    } catch (error) {
      failedPeriods += 1;
      results.push({
        error: error instanceof Error ? error.message : "Unknown process error",
        period,
      });
    }
  }

  return {
    failedPeriods,
    legislature: input.legislature ?? null,
    processedPeriods,
    results,
    totalPeriods: targetPeriods.length,
  };
}

export async function parseAndPersistAttendanceDocument(sessionId: string) {
  const row = await getSessionDocument(sessionId, "attendance");

  if (!row) {
    throw new Error("Attendance document not found for the provided session.");
  }

  const snapshotResult = await createDocumentSnapshotForRow(row.document.id, row.document.url);
  const extracted = await extractPdfTextFromBytes(snapshotResult.fetched.bytes);
  const parsed = parseAttendancePages(extracted.pages);
  const legislature =
    row.period?.legislature ?? inferLegislatureFromSessionUrl(row.session.sessionPageUrl);

  if (parsed.records.length === 0) {
    throw new Error("No attendance rows were parsed from the attendance PDF.");
  }

  return db.transaction(async (tx) => {
    const [parseRun] = await tx
      .insert(documentParseRuns)
      .values({
        documentId: row.document.id,
        parserVersion: ATTENDANCE_PARSER_VERSION,
        status: "running",
      })
      .returning();

    await tx
      .update(sessionDocuments)
      .set({
        extractedAt: new Date(),
        extractionMeta: {
          extractor: "unpdf",
          pages: extracted.pages.length,
          parserVersion: ATTENDANCE_PARSER_VERSION,
        },
        pageCount: extracted.pageCount,
        rawText: extracted.rawText,
      })
      .where(eq(sessionDocuments.id, row.document.id));

    const inferredSessionType = inferSessionTypeFromAttendanceSource({
      currentSessionType: row.session.sessionType,
      rawText: extracted.rawText,
      sessionPageUrl: row.session.sessionPageUrl,
      title: row.session.title,
    });

    if (inferredSessionType !== row.session.sessionType) {
      await tx
        .update(sessions)
        .set({
          sessionType: inferredSessionType,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, row.session.id));
    }

    await tx.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, row.session.id));
    await tx
      .delete(sessionGroupSummaries)
      .where(eq(sessionGroupSummaries.sessionId, row.session.id));

    await tx.delete(ingestAnomalies).where(eq(ingestAnomalies.documentId, row.document.id));

    const groupIdsByCode = new Map<string, string>();

    for (const summary of parsed.summaries) {
      const [group] = await tx
        .insert(parliamentaryGroups)
        .values({
          code: summary.groupCode,
          legislature,
          name: summary.groupName || formatGroupName(summary.groupCode),
        })
        .onConflictDoUpdate({
          set: {
            name: summary.groupName || formatGroupName(summary.groupCode),
          },
          target: [parliamentaryGroups.legislature, parliamentaryGroups.code],
        })
        .returning();

      groupIdsByCode.set(summary.groupCode, group.id);

      await tx.insert(sessionGroupSummaries).values({
        absenceCount: summary.absenceCount,
        attendanceCount: summary.attendanceCount,
        boardLeaveCount: summary.boardLeaveCount,
        cedulaCount: summary.cedulaCount,
        groupId: group.id,
        justifiedAbsenceCount: summary.justifiedAbsenceCount,
        notPresentInVotesCount: summary.notPresentInVotesCount,
        officialCommissionCount: summary.officialCommissionCount,
        rawLabel: summary.groupName,
        sessionId: row.session.id,
        sourceDocumentId: row.document.id,
        totalCount: summary.totalCount,
      });
    }

    for (const record of parsed.records) {
      const groupId = groupIdsByCode.get(record.groupCode) ?? null;
      const personId = await resolvePersonId(tx, {
        fullName: record.rawName,
        metadata: {
          latestSourceDocumentId: row.document.id,
        },
        normalizedName: record.normalizedName,
      });

      const [legislator] = await tx
        .insert(legislators)
        .values({
          currentGroupId: groupId,
          displayOrderHint: record.rowNumber,
          fullName: record.rawName,
          legislature,
          metadata: {
            latestSourceDocumentId: row.document.id,
          },
          normalizedName: record.normalizedName,
          personId,
        })
        .onConflictDoUpdate({
          set: {
            currentGroupId: groupId,
            displayOrderHint: record.rowNumber,
            fullName: record.rawName,
            metadata: {
              latestSourceDocumentId: row.document.id,
            },
            personId,
            updatedAt: new Date(),
          },
          target: [legislators.legislature, legislators.normalizedName],
        })
        .returning();

      await tx.insert(attendanceRecords).values({
        confidence: 100,
        groupId,
        legislatorId: legislator.id,
        metadata: {
          groupCode: record.groupCode,
          groupName: record.groupName,
        },
        normalizedName: record.normalizedName,
        pageNumber: record.pageNumber,
        rawName: record.rawName,
        rawStatus: record.rawStatus,
        rowNumber: record.rowNumber,
        sessionId: row.session.id,
        sourceDocumentId: row.document.id,
        sourceParseRunId: parseRun.id,
        status: record.status,
      });
    }

    await tx
      .update(documentParseRuns)
      .set({
        finishedAt: new Date(),
        metrics: {
          pageCount: extracted.pageCount,
          parserVersion: ATTENDANCE_PARSER_VERSION,
          recordCount: parsed.records.length,
          snapshotId: snapshotResult.snapshot.id,
          snapshotStatus: snapshotResult.snapshot.status,
          summaryCount: parsed.summaries.length,
        },
        status: "completed",
      })
      .where(eq(documentParseRuns.id, parseRun.id));

    const anomalyRows = buildAttendanceParseAnomalies(parsed, {
      documentId: row.document.id,
      parseRunId: parseRun.id,
      sessionId: row.session.id,
      sourceUrl: row.document.url,
    });

    if (anomalyRows.length > 0) {
      await tx.insert(ingestAnomalies).values(anomalyRows);
    }

    return {
      documentId: row.document.id,
      pageCount: extracted.pageCount,
      parseRunId: parseRun.id,
      recordCount: parsed.records.length,
      snapshotChanged: snapshotResult.changed,
      snapshotId: snapshotResult.snapshot.id,
      summaryCount: parsed.summaries.length,
    };
  });
}

export async function listStoredSessions() {
  return db.select().from(sessions).orderBy(desc(sessions.sessionDate));
}

export async function listStoredDocuments() {
  return db.select().from(sessionDocuments).orderBy(desc(sessionDocuments.createdAt));
}

function buildLegislatorWhereClause(scope: AnalyticsScope, search?: string) {
  const clauses = [];

  if (search) {
    clauses.push(...buildNormalizedNameSearchClauses(legislators.normalizedName, search));
  }

  if (scope.legislature) {
    clauses.push(eq(legislators.legislature, scope.legislature));
  }

  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }

  if (clauses.length === 0) {
    return;
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return and(...clauses);
}

async function resolvePersonId(
  tx: Pick<typeof db, "select" | "insert">,
  input: {
    fullName: string;
    normalizedName: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [existing] = await tx
    .select({
      id: people.id,
    })
    .from(people)
    .where(eq(people.normalizedName, input.normalizedName))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await tx
    .insert(people)
    .values({
      fullName: input.fullName,
      metadata: input.metadata ?? null,
      normalizedName: input.normalizedName,
    })
    .onConflictDoNothing({ target: people.normalizedName })
    .returning({
      id: people.id,
    });

  if (created) {
    return created.id;
  }

  const [conflicted] = await tx
    .select({
      id: people.id,
    })
    .from(people)
    .where(eq(people.normalizedName, input.normalizedName))
    .limit(1);

  if (!conflicted) {
    throw new Error(`Failed to resolve person for ${input.fullName}.`);
  }

  return conflicted.id;
}

function buildNormalizedNameSearchClauses(
  column: typeof legislators.normalizedName | typeof people.normalizedName,
  search: string,
) {
  const normalizedSearch = normalizeName(search);
  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  return tokens.map((token) => ilike(column, `%${token}%`));
}

function extractProfileMetadata(metadata: unknown) {
  const record = metadata as Record<string, unknown> | null;

  return {
    bio: (record?.bio as string | null) ?? null,
    imageUrl: (record?.imageUrl as string | null) ?? null,
  };
}

function sortItems<T>(items: T[], getValue: (item: T) => string | number | null, order: SortOrder) {
  return [...items].toSorted((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);

    if (av === bv) {
      return 0;
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }

    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : Number(av) - Number(bv);

    return order === "asc" ? cmp : -cmp;
  });
}

export async function listLegislators(
  search?: string,
  scope: AnalyticsScope = {},
  sort: LegislatorSort = "name",
  order: SortOrder = "asc",
) {
  const whereClause = buildLegislatorWhereClause(scope, search);

  const rows = await db
    .select({
      absenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'absence' then 1 else 0 end)::int`,
      attendanceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'attendance' then 1 else 0 end)::int`,
      boardLeaveCount: sql<number>`sum(case when ${attendanceRecords.status} = 'board_leave' then 1 else 0 end)::int`,
      cedulaCount: sql<number>`sum(case when ${attendanceRecords.status} = 'cedula' then 1 else 0 end)::int`,
      fullName: legislators.fullName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: legislators.id,
      justifiedAbsenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'justified_absence' then 1 else 0 end)::int`,
      legislature: legislators.legislature,
      notPresentInVotesCount: sql<number>`sum(case when ${attendanceRecords.status} = 'not_present_in_votes' then 1 else 0 end)::int`,
      officialCommissionCount: sql<number>`sum(case when ${attendanceRecords.status} = 'official_commission' then 1 else 0 end)::int`,
      personId: legislators.personId,
      personMetadata: people.metadata,
      sessionsMentioned: sql<number>`count(${attendanceRecords.id})::int`,
    })
    .from(legislators)
    .leftJoin(parliamentaryGroups, eq(legislators.currentGroupId, parliamentaryGroups.id))
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.legislatorId, legislators.id))
    .leftJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .where(whereClause)
    .groupBy(
      legislators.id,
      legislators.personId,
      legislators.fullName,
      legislators.legislature,
      people.metadata,
      parliamentaryGroups.code,
      parliamentaryGroups.name,
    );

  const enriched = rows.map((row) => {
    const { personMetadata, ...publicRow } = row;
    const attendanceRatio =
      row.sessionsMentioned > 0 ? row.attendanceCount / row.sessionsMentioned : 0;
    const absenceRatio =
      row.sessionsMentioned > 0
        ? (row.absenceCount + row.justifiedAbsenceCount) / row.sessionsMentioned
        : 0;

    return {
      ...publicRow,
      ...extractProfileMetadata(personMetadata),
      absenceRatio,
      attendanceRatio,
    };
  });

  const sortMap: Record<
    LegislatorSort,
    (item: (typeof enriched)[number]) => string | number | null
  > = {
    absence_count: (item) => item.absenceCount,
    attendance_count: (item) => item.attendanceCount,
    attendance_ratio: (item) => item.attendanceRatio,
    justified_absence_count: (item) => item.justifiedAbsenceCount,
    name: (item) => item.fullName,
    sessions_mentioned: (item) => item.sessionsMentioned,
  };

  return sortItems(enriched, sortMap[sort], order);
}

export async function getLegislatorById(legislatorId: string, scope: AnalyticsScope = {}) {
  const attendanceJoin = scope.periodId
    ? and(
        eq(attendanceRecords.legislatorId, legislators.id),
        inArray(
          attendanceRecords.sessionId,
          db
            .select({ id: sessions.id })
            .from(sessions)
            .where(eq(sessions.periodId, scope.periodId)),
        ),
      )
    : eq(attendanceRecords.legislatorId, legislators.id);

  const [summary] = await db
    .select({
      absenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'absence' then 1 else 0 end)::int`,
      attendanceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'attendance' then 1 else 0 end)::int`,
      boardLeaveCount: sql<number>`sum(case when ${attendanceRecords.status} = 'board_leave' then 1 else 0 end)::int`,
      cedulaCount: sql<number>`sum(case when ${attendanceRecords.status} = 'cedula' then 1 else 0 end)::int`,
      fullName: legislators.fullName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: legislators.id,
      justifiedAbsenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'justified_absence' then 1 else 0 end)::int`,
      legislature: legislators.legislature,
      normalizedName: legislators.normalizedName,
      notPresentInVotesCount: sql<number>`sum(case when ${attendanceRecords.status} = 'not_present_in_votes' then 1 else 0 end)::int`,
      officialCommissionCount: sql<number>`sum(case when ${attendanceRecords.status} = 'official_commission' then 1 else 0 end)::int`,
      personId: legislators.personId,
      personMetadata: people.metadata,
      sessionsMentioned: sql<number>`count(${attendanceRecords.id})::int`,
    })
    .from(legislators)
    .leftJoin(parliamentaryGroups, eq(legislators.currentGroupId, parliamentaryGroups.id))
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(attendanceRecords, attendanceJoin)
    .where(eq(legislators.id, legislatorId))
    .groupBy(
      legislators.id,
      legislators.personId,
      legislators.fullName,
      legislators.normalizedName,
      legislators.legislature,
      people.metadata,
      parliamentaryGroups.code,
      parliamentaryGroups.name,
    )
    .limit(1);

  if (!summary) {
    throw new Error("Legislator not found.");
  }

  const relatedRows = await db
    .select({
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: legislators.id,
      legislature: legislators.legislature,
    })
    .from(legislators)
    .leftJoin(parliamentaryGroups, eq(legislators.currentGroupId, parliamentaryGroups.id))
    .where(eq(legislators.personId, summary.personId));

  const sortedRelatedRows = [...relatedRows].toSorted(
    (left, right) => legislatureRank(right.legislature) - legislatureRank(left.legislature),
  );

  const { normalizedName: _normalizedName, personMetadata, ...publicSummary } = summary;

  return {
    ...publicSummary,
    ...extractProfileMetadata(personMetadata),
    relatedLegislatures: sortedRelatedRows.map((row) => ({
      groupCode: row.groupCode,
      groupName: row.groupName,
      id: row.id,
      isCurrent: row.id === summary.id,
      legislature: row.legislature,
    })),
  };
}

export async function listPeople(input: {
  search?: string;
  legislature?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 24));
  const clauses = [];

  if (input.search) {
    clauses.push(...buildNormalizedNameSearchClauses(people.normalizedName, input.search));
  }

  if (input.legislature) {
    clauses.push(eq(legislators.legislature, input.legislature));
  }

  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const rows = await db
    .select({
      fullName: legislators.fullName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: people.id,
      legislatorId: legislators.id,
      legislature: legislators.legislature,
      normalizedName: people.normalizedName,
      personId: people.id,
      personMetadata: people.metadata,
    })
    .from(legislators)
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(parliamentaryGroups, eq(legislators.currentGroupId, parliamentaryGroups.id))
    .where(whereClause)
    .orderBy(asc(legislators.fullName));
  const dedupedRows = input.legislature ? rows : [...dedupePeopleRows(rows).values()];
  const pagedRows = dedupedRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    items: pagedRows.map((item) => {
      const { personMetadata, ...publicItem } = item;

      return {
        ...publicItem,
        ...extractProfileMetadata(personMetadata),
      };
    }),
    page,
    pageSize,
    total: dedupedRows.length,
  };
}

function dedupePeopleRows<
  T extends {
    personId: string;
    legislature: string;
    personMetadata: unknown;
  },
>(rows: T[]) {
  const deduped = new Map<string, T>();

  for (const row of rows) {
    const current = deduped.get(row.personId);

    if (!current) {
      deduped.set(row.personId, row);
      continue;
    }

    if (comparePeopleRows(row, current) < 0) {
      deduped.set(row.personId, row);
    }
  }

  return deduped;
}

function comparePeopleRows<
  T extends {
    legislature: string;
    personMetadata: unknown;
  },
>(left: T, right: T) {
  const legislatureDiff = legislatureRank(right.legislature) - legislatureRank(left.legislature);

  if (legislatureDiff !== 0) {
    return legislatureDiff;
  }

  const leftHasProfile = hasProfileData(left.personMetadata);
  const rightHasProfile = hasProfileData(right.personMetadata);

  if (leftHasProfile !== rightHasProfile) {
    return rightHasProfile ? 1 : -1;
  }

  return 0;
}

function legislatureRank(value: string) {
  const map: Record<string, number> = {
    LIX: 59,
    LX: 60,
    LXI: 61,
    LXII: 62,
    LXIII: 63,
    LXIV: 64,
    LXV: 65,
    LXVI: 66,
    LXVII: 67,
    LXVIII: 68,
  };

  return map[value.toUpperCase()] ?? 0;
}

async function resolveLegislatorIdForPerson(personId: string, legislature?: string) {
  const rows = await db
    .select({
      id: legislators.id,
      legislature: legislators.legislature,
    })
    .from(legislators)
    .where(eq(legislators.personId, personId));

  if (rows.length === 0) {
    throw new Error("Person not found.");
  }

  if (legislature) {
    const exact = rows.find((row) => row.legislature === legislature);

    if (exact) {
      return exact.id;
    }
  }

  const fallback = [...rows].toSorted(
    (left, right) => legislatureRank(right.legislature) - legislatureRank(left.legislature),
  )[0];

  if (!fallback) {
    throw new Error("Person not found.");
  }

  return fallback.id;
}

function hasProfileData(metadata: unknown) {
  const record = metadata as Record<string, unknown> | null;

  return Boolean(record?.imageUrl || record?.bio);
}

export async function updateLegislatorProfile(
  legislatorId: string,
  input: {
    imageUrl?: string | null;
    bio?: string | null;
  },
) {
  const [existing] = await db
    .select({
      id: legislators.id,
      personId: legislators.personId,
      personMetadata: people.metadata,
    })
    .from(legislators)
    .innerJoin(people, eq(legislators.personId, people.id))
    .where(eq(legislators.id, legislatorId))
    .limit(1);

  if (!existing) {
    throw new Error("Legislator not found.");
  }

  const currentMetadata = (existing.personMetadata as Record<string, unknown> | null) ?? {};

  const [updated] = await db
    .update(people)
    .set({
      metadata: {
        ...currentMetadata,
        bio: input.bio ?? null,
        imageUrl: input.imageUrl ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(people.id, existing.personId))
    .returning({
      id: people.id,
      metadata: people.metadata,
      updatedAt: people.updatedAt,
    });

  return updated;
}

export async function getPersonById(personId: string, scope: AnalyticsScope = {}) {
  const legislatorId = await resolveLegislatorIdForPerson(personId, scope.legislature);

  return getLegislatorById(legislatorId, scope);
}

export async function getPersonAttendanceHistory(personId: string, scope: AnalyticsScope = {}) {
  const legislatorId = await resolveLegislatorIdForPerson(personId, scope.legislature);

  return getLegislatorAttendanceHistory(legislatorId, scope);
}

export async function getPersonTrend(personId: string, scope: AnalyticsScope = {}) {
  const legislatorId = await resolveLegislatorIdForPerson(personId, scope.legislature);

  return getLegislatorTrend(legislatorId, scope);
}

export async function getLegislatorAttendanceHistory(
  legislatorId: string,
  scope: AnalyticsScope = {},
) {
  const whereClauses = [eq(attendanceRecords.legislatorId, legislatorId)];
  if (scope.periodId) {
    whereClauses.push(eq(sessions.periodId, scope.periodId));
  }

  return db
    .select({
      attendanceRecordId: attendanceRecords.id,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      rawStatus: attendanceRecords.rawStatus,
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionPageUrl: sessions.sessionPageUrl,
      sessionType: sessions.sessionType,
      status: attendanceRecords.status,
      title: sessions.title,
    })
    .from(attendanceRecords)
    .innerJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(parliamentaryGroups, eq(attendanceRecords.groupId, parliamentaryGroups.id))
    .where(and(...whereClauses))
    .orderBy(desc(sessions.sessionDate), desc(attendanceRecords.createdAt));
}

export async function getSessionsWithParsedAttendance() {
  return db
    .select({
      attendanceRecordCount: count(attendanceRecords.id),
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      title: sessions.title,
    })
    .from(sessions)
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .groupBy(sessions.id, sessions.sessionDate, sessions.title, sessions.sessionType)
    .orderBy(desc(sessions.sessionDate));
}

export async function getAnalyticsOverview(scope: AnalyticsScope = {}) {
  const sessionWhere = [];
  if (scope.periodId) {
    sessionWhere.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    sessionWhere.push(eq(legislativePeriods.legislature, scope.legislature));
  }
  if (!scope.includePermanent) {
    sessionWhere.push(ne(sessions.sessionType, "permanent"));
  }
  const combinedWhere =
    sessionWhere.length === 0
      ? undefined
      : sessionWhere.length === 1
        ? sessionWhere[0]
        : and(...sessionWhere);

  const [sessionsSummary] = await db
    .select({
      legislatorsCount: sql<number>`count(distinct ${attendanceRecords.legislatorId})::int`,
      parsedSessions: sql<number>`count(distinct case when ${attendanceRecords.id} is not null then ${sessions.id} end)::int`,
      totalSessions: sql<number>`count(distinct ${sessions.id})::int`,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .where(combinedWhere);

  const [statusSummary] = await db
    .select({
      absenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.absenceCount}), 0)::int`,
      attendanceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.attendanceCount}), 0)::int`,
      boardLeaveCount: sql<number>`coalesce(sum(${sessionGroupSummaries.boardLeaveCount}), 0)::int`,
      cedulaCount: sql<number>`coalesce(sum(${sessionGroupSummaries.cedulaCount}), 0)::int`,
      justifiedAbsenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.justifiedAbsenceCount}), 0)::int`,
      notPresentInVotesCount: sql<number>`coalesce(sum(${sessionGroupSummaries.notPresentInVotesCount}), 0)::int`,
      officialCommissionCount: sql<number>`coalesce(sum(${sessionGroupSummaries.officialCommissionCount}), 0)::int`,
      totalMentions: sql<number>`coalesce(sum(${sessionGroupSummaries.totalCount}), 0)::int`,
    })
    .from(sessionGroupSummaries)
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(combinedWhere);

  return {
    scope,
    ...sessionsSummary,
    ...statusSummary,
    attendanceRatio:
      statusSummary.totalMentions > 0
        ? statusSummary.attendanceCount / statusSummary.totalMentions
        : 0,
    absenceRatio:
      statusSummary.totalMentions > 0
        ? (statusSummary.absenceCount + statusSummary.justifiedAbsenceCount) /
          statusSummary.totalMentions
        : 0,
    justifiedAbsenceRatio:
      statusSummary.totalMentions > 0
        ? statusSummary.justifiedAbsenceCount / statusSummary.totalMentions
        : 0,
  };
}

export async function listPartyAnalytics(scope: AnalyticsScope = {}, order: SortOrder = "desc") {
  const clauses = [];
  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    clauses.push(eq(parliamentaryGroups.legislature, scope.legislature));
  }
  if (!scope.includePermanent) {
    clauses.push(ne(sessions.sessionType, "permanent"));
  }
  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const rows = await db
    .select({
      absenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.absenceCount}), 0)::int`,
      attendanceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.attendanceCount}), 0)::int`,
      boardLeaveCount: sql<number>`coalesce(sum(${sessionGroupSummaries.boardLeaveCount}), 0)::int`,
      cedulaCount: sql<number>`coalesce(sum(${sessionGroupSummaries.cedulaCount}), 0)::int`,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      justifiedAbsenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.justifiedAbsenceCount}), 0)::int`,
      legislature: parliamentaryGroups.legislature,
      notPresentInVotesCount: sql<number>`coalesce(sum(${sessionGroupSummaries.notPresentInVotesCount}), 0)::int`,
      officialCommissionCount: sql<number>`coalesce(sum(${sessionGroupSummaries.officialCommissionCount}), 0)::int`,
      sessionCount: sql<number>`count(distinct ${sessions.id})::int`,
      totalCount: sql<number>`coalesce(sum(${sessionGroupSummaries.totalCount}), 0)::int`,
    })
    .from(sessionGroupSummaries)
    .innerJoin(parliamentaryGroups, eq(sessionGroupSummaries.groupId, parliamentaryGroups.id))
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .where(whereClause)
    .groupBy(parliamentaryGroups.code, parliamentaryGroups.name, parliamentaryGroups.legislature);

  const enriched = rows.map((row) => ({
    ...row,
    absenceRatio:
      row.totalCount > 0 ? (row.absenceCount + row.justifiedAbsenceCount) / row.totalCount : 0,
    attendanceRatio: row.totalCount > 0 ? row.attendanceCount / row.totalCount : 0,
    justifiedAbsenceRatio: row.totalCount > 0 ? row.justifiedAbsenceCount / row.totalCount : 0,
  }));

  return sortItems(enriched, (item) => item.attendanceRatio, order);
}

export async function getPartyTrends(scope: AnalyticsScope = {}) {
  const clauses = [];
  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    clauses.push(eq(parliamentaryGroups.legislature, scope.legislature));
  }
  if (!scope.includePermanent) {
    clauses.push(ne(sessions.sessionType, "permanent"));
  }
  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const rows = await db
    .select({
      absenceCount: sessionGroupSummaries.absenceCount,
      attendanceCount: sessionGroupSummaries.attendanceCount,
      boardLeaveCount: sessionGroupSummaries.boardLeaveCount,
      cedulaCount: sessionGroupSummaries.cedulaCount,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      justifiedAbsenceCount: sessionGroupSummaries.justifiedAbsenceCount,
      notPresentInVotesCount: sessionGroupSummaries.notPresentInVotesCount,
      officialCommissionCount: sessionGroupSummaries.officialCommissionCount,
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      totalCount: sessionGroupSummaries.totalCount,
    })
    .from(sessionGroupSummaries)
    .innerJoin(parliamentaryGroups, eq(sessionGroupSummaries.groupId, parliamentaryGroups.id))
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .where(whereClause)
    .orderBy(asc(sessions.sessionDate), asc(parliamentaryGroups.code));

  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      pointsByDate: Map<
        string,
        {
          sessionDate: string | null;
          sessionId: string;
          sessionType: string;
          aggregatedSessionCount: number;
          attendanceCount: number;
          cedulaCount: number;
          officialCommissionCount: number;
          absenceCount: number;
          justifiedAbsenceCount: number;
          totalCount: number;
        }
      >;
      points: {
        sessionDate: string | null;
        sessionId: string;
        sessionType: string;
        aggregatedSessionCount: number;
        attendanceRatio: number;
        participationRatio: number;
        resolvedRatio: number;
        absenceRatio: number;
        justifiedAbsenceRatio: number;
        unexcusedAbsenceRatio: number;
        attendanceCount: number;
        cedulaCount: number;
        officialCommissionCount: number;
        absenceCount: number;
        justifiedAbsenceCount: number;
        totalCount: number;
      }[];
    }
  >();

  for (const row of rows) {
    const existing = grouped.get(row.groupCode) ?? {
      key: row.groupCode,
      label: row.groupName,
      points: [],
      pointsByDate: new Map(),
    };

    const dateKey = row.sessionDate ? row.sessionDate.toISOString() : `session:${row.sessionId}`;
    const existingPoint = existing.pointsByDate.get(dateKey) ?? {
      absenceCount: row.absenceCount,
      aggregatedSessionCount: 1,
      attendanceCount: row.attendanceCount,
      cedulaCount: row.cedulaCount,
      justifiedAbsenceCount: row.justifiedAbsenceCount,
      officialCommissionCount: row.officialCommissionCount,
      sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
      sessionId: row.sessionId,
      sessionType: row.sessionType,
      totalCount: row.totalCount,
    };

    if (existing.pointsByDate.has(dateKey)) {
      existingPoint.sessionType =
        existingPoint.sessionType === row.sessionType ? row.sessionType : "mixed";
      existingPoint.aggregatedSessionCount += 1;
      existingPoint.attendanceCount += row.attendanceCount;
      existingPoint.cedulaCount += row.cedulaCount;
      existingPoint.officialCommissionCount += row.officialCommissionCount;
      existingPoint.absenceCount += row.absenceCount;
      existingPoint.justifiedAbsenceCount += row.justifiedAbsenceCount;
      existingPoint.totalCount += row.totalCount;
    }

    existing.pointsByDate.set(dateKey, existingPoint);

    grouped.set(row.groupCode, existing);
  }

  return {
    scope,
    series: [...grouped.values()].map((series) => ({
      key: series.key,
      label: series.label,
      points: [...series.pointsByDate.values()]
        .map((point) => {
          const attendanceRatio =
            point.totalCount > 0 ? point.attendanceCount / point.totalCount : 0;
          const participationRatio =
            point.totalCount > 0
              ? (point.attendanceCount + point.cedulaCount + point.officialCommissionCount) /
                point.totalCount
              : 0;
          const resolvedRatio =
            point.totalCount > 0
              ? (point.attendanceCount +
                  point.cedulaCount +
                  point.officialCommissionCount +
                  point.justifiedAbsenceCount) /
                point.totalCount
              : 0;
          const absenceRatio =
            point.totalCount > 0
              ? (point.absenceCount + point.justifiedAbsenceCount) / point.totalCount
              : 0;
          const justifiedAbsenceRatio =
            point.totalCount > 0 ? point.justifiedAbsenceCount / point.totalCount : 0;
          const unexcusedAbsenceRatio =
            point.totalCount > 0 ? point.absenceCount / point.totalCount : 0;

          return {
            ...point,
            absenceRatio,
            attendanceRatio,
            justifiedAbsenceRatio,
            participationRatio,
            resolvedRatio,
            unexcusedAbsenceRatio,
          };
        })
        .toSorted((a, b) =>
          (a.sessionDate ?? a.sessionId).localeCompare(b.sessionDate ?? b.sessionId),
        ),
    })),
  };
}

export async function getLegislatorTrend(legislatorId: string, scope: AnalyticsScope = {}) {
  const clauses = [eq(attendanceRecords.legislatorId, legislatorId)];
  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    clauses.push(eq(legislators.legislature, scope.legislature));
  }
  const whereClause = clauses.length === 1 ? clauses[0] : and(...clauses);

  const [legislator] = await db
    .select({
      fullName: legislators.fullName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: legislators.id,
      legislature: legislators.legislature,
    })
    .from(legislators)
    .leftJoin(parliamentaryGroups, eq(legislators.currentGroupId, parliamentaryGroups.id))
    .where(eq(legislators.id, legislatorId))
    .limit(1);

  if (!legislator) {
    throw new Error("Legislator not found.");
  }

  const rows = await db
    .select({
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      status: attendanceRecords.status,
      title: sessions.title,
    })
    .from(attendanceRecords)
    .innerJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .innerJoin(legislators, eq(attendanceRecords.legislatorId, legislators.id))
    .where(whereClause)
    .orderBy(asc(sessions.sessionDate), asc(sessions.title));

  return {
    legislator,
    points: rows.map((row) => ({
      sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
      sessionId: row.sessionId,
      sessionType: row.sessionType,
      status: row.status,
      title: row.title,
      value:
        row.status === "attendance" ||
        row.status === "cedula" ||
        row.status === "official_commission" ||
        row.status === "board_leave"
          ? 1
          : 0,
    })),
  };
}

export async function getSessionComposition(sessionId: string) {
  const [session] = await db
    .select({
      legislature: legislativePeriods.legislature,
      periodId: sessions.periodId,
      periodLabel: legislativePeriods.label,
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      title: sessions.title,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error("Session not found.");
  }

  const parties = await db
    .select({
      absenceCount: sessionGroupSummaries.absenceCount,
      attendanceCount: sessionGroupSummaries.attendanceCount,
      boardLeaveCount: sessionGroupSummaries.boardLeaveCount,
      cedulaCount: sessionGroupSummaries.cedulaCount,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      justifiedAbsenceCount: sessionGroupSummaries.justifiedAbsenceCount,
      notPresentInVotesCount: sessionGroupSummaries.notPresentInVotesCount,
      officialCommissionCount: sessionGroupSummaries.officialCommissionCount,
      totalCount: sessionGroupSummaries.totalCount,
    })
    .from(sessionGroupSummaries)
    .innerJoin(parliamentaryGroups, eq(sessionGroupSummaries.groupId, parliamentaryGroups.id))
    .where(eq(sessionGroupSummaries.sessionId, sessionId))
    .orderBy(asc(parliamentaryGroups.code));

  return {
    legislature: session.legislature,
    parties: parties.map((party) => ({
      ...party,
      absenceRatio:
        party.totalCount > 0
          ? (party.absenceCount + party.justifiedAbsenceCount) / party.totalCount
          : 0,
      attendanceRatio: party.totalCount > 0 ? party.attendanceCount / party.totalCount : 0,
      justifiedAbsenceRatio:
        party.totalCount > 0 ? party.justifiedAbsenceCount / party.totalCount : 0,
    })),
    periodId: session.periodId,
    periodLabel: session.periodLabel,
    sessionDate: session.sessionDate ? session.sessionDate.toISOString() : null,
    sessionId: session.sessionId,
    sessionType: session.sessionType,
    title: session.title,
  };
}

export async function getQualityOverview(scope: AnalyticsScope = {}) {
  const clauses = [];
  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    clauses.push(eq(legislativePeriods.legislature, scope.legislature));
  }
  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const [summary] = await db
    .select({
      changedDocuments: sql<number>`count(distinct case when ${documentSnapshots.status} = 'changed' then ${sessionDocuments.id} end)::int`,
      failedSnapshots: sql<number>`count(distinct case when ${documentSnapshots.status} = 'failed' then ${sessionDocuments.id} end)::int`,
      matchedSessions: sql<number>`count(distinct case when ${sessionReconciliations.matches} = 'true' then ${sessions.id} end)::int`,
      mismatchedSessions: sql<number>`count(distinct case when ${sessionReconciliations.matches} = 'false' then ${sessions.id} end)::int`,
      parsedSessions: sql<number>`count(distinct case when ${attendanceRecords.id} is not null then ${sessions.id} end)::int`,
      reconciledSessions: sql<number>`count(distinct case when ${sessionReconciliations.id} is not null then ${sessions.id} end)::int`,
      sessionsWithAbsenceDoc: sql<number>`count(distinct case when ${sessionDocuments.kind} = 'absence' then ${sessions.id} end)::int`,
      sessionsWithAttendanceDoc: sql<number>`count(distinct case when ${sessionDocuments.kind} = 'attendance' then ${sessions.id} end)::int`,
      totalSessions: sql<number>`count(distinct ${sessions.id})::int`,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(sessionDocuments, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(sessionReconciliations, eq(sessionReconciliations.sessionId, sessions.id))
    .leftJoin(documentSnapshots, eq(documentSnapshots.documentId, sessionDocuments.id))
    .where(whereClause);

  return {
    scope,
    ...summary,
    parseCoverageRatio:
      summary.totalSessions > 0 ? summary.parsedSessions / summary.totalSessions : 0,
    reconciliationCoverageRatio:
      summary.totalSessions > 0 ? summary.reconciledSessions / summary.totalSessions : 0,
    matchRatio:
      summary.reconciledSessions > 0 ? summary.matchedSessions / summary.reconciledSessions : 0,
  };
}

export async function listSessionQuality(scope: AnalyticsScope = {}) {
  const clauses = [];
  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId));
  }
  if (scope.legislature) {
    clauses.push(eq(legislativePeriods.legislature, scope.legislature));
  }
  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const rows = await db
    .select({
      absenceDocumentId: sql<
        string | null
      >`max(case when ${sessionDocuments.kind} = 'absence' then ${sessionDocuments.id}::text else null end)`,
      attendanceDocumentId: sql<
        string | null
      >`max(case when ${sessionDocuments.kind} = 'attendance' then ${sessionDocuments.id}::text else null end)`,
      attendanceRecordCount: sql<number>`count(distinct ${attendanceRecords.id})::int`,
      extraInAttendanceCount: sql<number>`coalesce(max(${sessionReconciliations.extraInAttendanceCount}), 0)::int`,
      groupDiffCount: sql<number>`coalesce(max(${sessionReconciliations.groupDiffCount}), 0)::int`,
      lastChangedAt: sql<Date | null>`max(${sessionDocuments.lastChangedAt})`,
      lastCheckedAt: sql<Date | null>`max(${sessionDocuments.lastCheckedAt})`,
      latestSnapshotStatus: sql<string | null>`max(${documentSnapshots.status})`,
      legislature: legislativePeriods.legislature,
      missingFromAttendanceCount: sql<number>`coalesce(max(${sessionReconciliations.missingFromAttendanceCount}), 0)::int`,
      parseRunCount: sql<number>`count(distinct ${documentParseRuns.id})::int`,
      periodId: sessions.periodId,
      periodLabel: legislativePeriods.label,
      reconciled: sql<string | null>`max(${sessionReconciliations.matches})`,
      reconciledAt: sql<Date | null>`max(${sessionReconciliations.reconciledAt})`,
      sessionDate: sessions.sessionDate,
      sessionId: sessions.id,
      sessionType: sessions.sessionType,
      title: sessions.title,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(sessionDocuments, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(documentSnapshots, eq(documentSnapshots.documentId, sessionDocuments.id))
    .leftJoin(documentParseRuns, eq(documentParseRuns.documentId, sessionDocuments.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(sessionReconciliations, eq(sessionReconciliations.sessionId, sessions.id))
    .where(whereClause)
    .groupBy(
      sessions.id,
      sessions.sessionDate,
      sessions.title,
      sessions.sessionType,
      legislativePeriods.legislature,
      sessions.periodId,
      legislativePeriods.label,
    )
    .orderBy(desc(sessions.sessionDate), asc(sessions.title));

  return rows.map((row) => ({
    ...row,
    parseStatus:
      row.attendanceRecordCount > 0
        ? "parsed"
        : row.attendanceDocumentId
          ? "discovered"
          : "missing_attendance_document",
    reconciliationStatus:
      row.reconciled === "true"
        ? "matched"
        : row.reconciled === "false"
          ? "mismatched"
          : row.absenceDocumentId
            ? "not_reconciled"
            : "missing_absence_document",
  }));
}

interface IngestAnomalyScope {
  legislature?: string;
  kind?: string;
  limit?: number;
}

export async function listIngestAnomalies(scope: IngestAnomalyScope = {}) {
  const clauses = [];
  if (scope.legislature) {
    clauses.push(eq(legislativePeriods.legislature, scope.legislature));
  }
  if (scope.kind) {
    clauses.push(eq(ingestAnomalies.kind, scope.kind));
  }
  const whereClause =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);

  const limit = Math.min(scope.limit ?? 200, 500);

  const rows = await db
    .select({
      createdAt: ingestAnomalies.createdAt,
      documentId: ingestAnomalies.documentId,
      id: ingestAnomalies.id,
      kind: ingestAnomalies.kind,
      legislature: legislativePeriods.legislature,
      message: ingestAnomalies.message,
      metadata: ingestAnomalies.metadata,
      parseRunId: ingestAnomalies.parseRunId,
      sessionDate: sessions.sessionDate,
      sessionId: ingestAnomalies.sessionId,
      sessionTitle: sessions.title,
      snippet: ingestAnomalies.snippet,
      sourceUrl: ingestAnomalies.sourceUrl,
    })
    .from(ingestAnomalies)
    .innerJoin(sessions, eq(ingestAnomalies.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(whereClause)
    .orderBy(desc(ingestAnomalies.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
  }));
}

export async function getAdminSessionInspection(sessionId: string) {
  const [sessionRow] = await db
    .select({
      period: legislativePeriods,
      session: sessions,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!sessionRow) {
    throw new Error("Session not found.");
  }

  const documents = await db
    .select()
    .from(sessionDocuments)
    .where(eq(sessionDocuments.sessionId, sessionId));

  const snapshotRows = await db
    .select({
      documentKind: sessionDocuments.kind,
      snapshot: documentSnapshots,
    })
    .from(documentSnapshots)
    .innerJoin(sessionDocuments, eq(documentSnapshots.documentId, sessionDocuments.id))
    .where(eq(sessionDocuments.sessionId, sessionId))
    .orderBy(desc(documentSnapshots.fetchedAt));

  const parseRunRows = await db
    .select({
      documentKind: sessionDocuments.kind,
      parseRun: documentParseRuns,
    })
    .from(documentParseRuns)
    .innerJoin(sessionDocuments, eq(documentParseRuns.documentId, sessionDocuments.id))
    .where(eq(sessionDocuments.sessionId, sessionId))
    .orderBy(desc(documentParseRuns.startedAt));

  const [reconciliation] = await db
    .select()
    .from(sessionReconciliations)
    .where(eq(sessionReconciliations.sessionId, sessionId))
    .limit(1);

  const attendanceRows = await db
    .select({
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      id: attendanceRecords.id,
      normalizedName: attendanceRecords.normalizedName,
      pageNumber: attendanceRecords.pageNumber,
      rawName: attendanceRecords.rawName,
      rawStatus: attendanceRecords.rawStatus,
      rowNumber: attendanceRecords.rowNumber,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .leftJoin(parliamentaryGroups, eq(attendanceRecords.groupId, parliamentaryGroups.id))
    .where(eq(attendanceRecords.sessionId, sessionId))
    .orderBy(asc(attendanceRecords.rowNumber))
    .limit(600);

  const anomalies = await db
    .select()
    .from(ingestAnomalies)
    .where(eq(ingestAnomalies.sessionId, sessionId))
    .orderBy(desc(ingestAnomalies.createdAt))
    .limit(200);

  const attendanceDoc = documents.find((doc) => doc.kind === "attendance");

  return {
    anomalies: anomalies.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    attendancePreview: attendanceRows,
    documents,
    parseRuns: parseRunRows.map((row) => ({
      ...row.parseRun,
      documentKind: row.documentKind,
      finishedAt: row.parseRun.finishedAt ? row.parseRun.finishedAt.toISOString() : null,
      startedAt: row.parseRun.startedAt.toISOString(),
    })),
    period: sessionRow.period,
    rawTextPreview:
      attendanceDoc?.rawText && attendanceDoc.rawText.length > 0
        ? attendanceDoc.rawText.slice(0, 8000)
        : null,
    reconciliation: reconciliation
      ? {
          ...reconciliation,
          details: reconciliation.details as
            | {
                missingFromAttendance?: string[];
                extraInAttendance?: string[];
                groupDiffs?: Array<{
                  groupCode: string;
                  attendanceCount: number;
                  absenceCount: number;
                  difference: number;
                }>;
              }
            | undefined,
          reconciledAt: reconciliation.reconciledAt.toISOString(),
        }
      : null,
    session: {
      ...sessionRow.session,
      sessionDate: sessionRow.session.sessionDate
        ? sessionRow.session.sessionDate.toISOString()
        : null,
    },
    snapshots: snapshotRows.map((row) => ({
      ...row.snapshot,
      documentKind: row.documentKind,
      fetchedAt: row.snapshot.fetchedAt.toISOString(),
    })),
  };
}

// Lista de códigos de grupo válidos conocidos
const VALID_GROUP_CODES = new Set([
  "MORENA",
  "PAN",
  "PRI",
  "PRD",
  "PVEM",
  "PT",
  "MC",
  "IND",
  "INDEPENDIENTE",
]);

function isValidGroupCode(code: string): boolean {
  // Si está en la lista blanca, es válido
  if (VALID_GROUP_CODES.has(code.toUpperCase())) {
    return true;
  }

  // Si tiene más de 10 caracteres, probablemente es un nombre de persona
  if (code.length > 10) {
    return false;
  }

  // Si contiene números, probablemente es inválido (ej: "194 RENDON...")
  if (/\d/.test(code)) {
    return false;
  }

  // Si tiene más de 2 palabras, probablemente es un nombre
  if (code.trim().split(/\s+/).length > 2) {
    return false;
  }

  return true;
}

export async function cleanupInvalidGroups(legislature?: string) {
  // Buscar grupos inválidos
  const invalidGroups = await db
    .select({
      code: parliamentaryGroups.code,
      id: parliamentaryGroups.id,
      legislature: parliamentaryGroups.legislature,
      name: parliamentaryGroups.name,
    })
    .from(parliamentaryGroups)
    .where(legislature ? eq(parliamentaryGroups.legislature, legislature) : undefined)
    .then((rows) => rows.filter((row) => !isValidGroupCode(row.code)));

  if (invalidGroups.length === 0) {
    return { deleted: 0, groups: [] };
  }

  const invalidIds = invalidGroups.map((g) => g.id);

  // Eliminar registros relacionados primero
  await db.delete(sessionGroupSummaries).where(inArray(sessionGroupSummaries.groupId, invalidIds));

  await db.delete(attendanceRecords).where(inArray(attendanceRecords.groupId, invalidIds));

  // Actualizar legisladores para remover referencia a grupos inválidos
  await db
    .update(legislators)
    .set({ currentGroupId: null })
    .where(inArray(legislators.currentGroupId, invalidIds));

  // Eliminar los grupos inválidos
  await db.delete(parliamentaryGroups).where(inArray(parliamentaryGroups.id, invalidIds));

  return {
    deleted: invalidGroups.length,
    groups: invalidGroups.map((g) => ({
      code: g.code,
      legislature: g.legislature,
      name: g.name,
    })),
  };
}
