import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm"

import { db } from "../../db"
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
  type attendanceStatusEnum,
  type documentKindEnum,
} from "../../db/schema"
import {
  fetchAttendancePeriods,
  fetchSessionDetails,
  fetchSessionsFromPeriod,
  pickLatestPeriod,
} from "../gaceta/client"
import {
  KNOWN_GROUP_CODES,
  normalizeName,
  parseAttendancePages,
  type ParsedAttendanceDocument,
} from "./parser"
import {
  extractPdfTextFromBytes,
  extractPdfTextFromUrl,
  fetchPdfFromUrl,
} from "../pdf/extractor"
import { parseAbsencePages } from "./absence-parser"

type DocumentKind = (typeof documentKindEnum.enumValues)[number]
type SessionType = (typeof sessions.$inferInsert)["sessionType"]
type AnalyticsScope = {
  legislature?: string
  periodId?: string
  includePermanent?: boolean
}

const ATTENDANCE_PARSER_VERSION = "attendance-v2"

type LegislatorSort =
  | "name"
  | "attendance_ratio"
  | "attendance_count"
  | "absence_count"
  | "justified_absence_count"
  | "sessions_mentioned"

type SortOrder = "asc" | "desc"

function toDocumentKind(kind: "attendance" | "absence"): DocumentKind {
  return kind === "attendance" ? "attendance" : "absence"
}

function inferLegislatureFromSessionUrl(sessionPageUrl: string): string {
  const match = sessionPageUrl.match(/\/Gaceta\/(\d+)\//)
  const code = match?.[1]

  if (code === "66") return "LXVI"
  if (code === "65") return "LXV"
  if (code === "64") return "LXIV"
  if (code === "63") return "LXIII"
  if (code === "62") return "LXII"
  if (code === "61") return "LXI"
  if (code === "60") return "LX"
  if (code === "59") return "LIX"
  return "UNKNOWN"
}

function formatGroupName(code: string): string {
  if (code === "MORENA") return "Movimiento Regeneración Nacional"
  if (code === "PAN") return "Partido Acción Nacional"
  if (code === "PVEM") return "Partido Verde Ecologista de México"
  if (code === "PT") return "Partido del Trabajo"
  if (code === "PRI") return "Partido Revolucionario Institucional"
  if (code === "PRD") return "Partido de la Revolución Democrática"
  if (code === "MC") return "Movimiento Ciudadano"
  if (code === "IND") return "Independiente"
  return code
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

function inferSessionTypeFromAttendanceSource(input: {
  sessionPageUrl: string
  title: string
  rawText: string
  currentSessionType: SessionType
}): SessionType {
  const source = stripAccents(
    `${input.sessionPageUrl} ${input.title} ${input.rawText.slice(0, 400)}`
  ).toLowerCase()

  if (
    source.includes("-cp-") ||
    source.includes("asistenciasp") ||
    source.includes("comision permanente")
  ) {
    return "permanent"
  }
  if (
    source.includes("-v-") ||
    source.includes("sesion de votacion") ||
    source.includes("sesion de votación")
  ) {
    return "vote"
  }
  if (
    source.includes("-s-") ||
    source.includes("sesion solemne") ||
    source.includes("sesion especial")
  ) {
    return "special"
  }
  if (source.includes("sesion ordinaria")) {
    return "ordinary"
  }

  return input.currentSessionType ?? "unknown"
}

type AttendanceAnomalyInsert = typeof ingestAnomalies.$inferInsert

function buildAttendanceParseAnomalies(
  parsed: ParsedAttendanceDocument,
  ctx: {
    sessionId: string
    documentId: string
    parseRunId: string
    sourceUrl: string
  }
): AttendanceAnomalyInsert[] {
  const rows: AttendanceAnomalyInsert[] = []
  const seen = new Set<string>()
  const push = (
    kind: string,
    message: string,
    snippet?: string | null,
    metadata?: Record<string, unknown> | null
  ) => {
    const key = `${kind}:${snippet ?? message}`
    if (seen.has(key)) return
    seen.add(key)
    if (rows.length >= 200) return
    rows.push({
      sessionId: ctx.sessionId,
      documentId: ctx.documentId,
      parseRunId: ctx.parseRunId,
      kind,
      message,
      snippet: snippet ?? undefined,
      sourceUrl: ctx.sourceUrl,
      metadata: metadata ?? undefined,
    })
  }

  if (parsed.parserPath === "compressed") {
    push(
      "compressed_format",
      "Se usó el parser compacto de Comisión Permanente.",
      null,
      { parserPath: parsed.parserPath }
    )
  }

  for (const record of parsed.records) {
    if (record.status === "unknown") {
      push(
        "unknown_status",
        `Estatus no reconocido: «${record.rawStatus}»`,
        `${record.rawName} — ${record.rawStatus}`,
        { rawStatus: record.rawStatus }
      )
    }
    if (!KNOWN_GROUP_CODES.has(record.groupCode)) {
      push(
        "unknown_group",
        `Grupo no catalogado (${record.groupCode})`,
        record.groupName,
        { groupCode: record.groupCode, groupName: record.groupName }
      )
    }
  }

  return rows
}

export async function listPeriods() {
  return fetchAttendancePeriods()
}

export async function getLatestPeriod() {
  const remotePeriods = await fetchAttendancePeriods()
  const latest = pickLatestPeriod(remotePeriods)

  if (!latest) {
    return { latest: null, stored: null }
  }

  const [stored] = await db
    .select()
    .from(legislativePeriods)
    .where(eq(legislativePeriods.periodPageUrl, latest.periodPageUrl))
    .limit(1)

  return {
    latest,
    stored: stored ?? null,
  }
}

export async function listStoredPeriods() {
  return db
    .select()
    .from(legislativePeriods)
    .orderBy(desc(legislativePeriods.discoveredAt))
}

export async function discoverAndPersistPeriod(periodPageUrl: string) {
  const remotePeriods = await fetchAttendancePeriods()
  const remotePeriod = remotePeriods.find(
    (period) => period.periodPageUrl === periodPageUrl
  )

  if (!remotePeriod) {
    throw new Error(
      "The provided period URL was not found in gp_asistencias.html"
    )
  }

  const [periodRecord] = await db
    .insert(legislativePeriods)
    .values(remotePeriod)
    .onConflictDoUpdate({
      target: legislativePeriods.periodPageUrl,
      set: {
        label: remotePeriod.label,
        legislature: remotePeriod.legislature,
        yearSpan: remotePeriod.yearSpan,
      },
    })
    .returning()

  const sessionUrls = await fetchSessionsFromPeriod(periodPageUrl)
  const persistedSessions = []

  for (const sessionUrl of sessionUrls) {
    const details = await fetchSessionDetails(sessionUrl)

    const [sessionRecord] = await db
      .insert(sessions)
      .values({
        periodId: periodRecord.id,
        gacetaNumber: details.gacetaNumber,
        sessionDate: details.sessionDate,
        title: details.title,
        sessionType: details.sessionType,
        sessionPageUrl: details.sessionPageUrl,
        sourceSlug: details.sourceSlug,
        metadata: {
          documents: details.documents,
        },
      })
      .onConflictDoUpdate({
        target: sessions.sessionPageUrl,
        set: {
          periodId: periodRecord.id,
          gacetaNumber: details.gacetaNumber,
          sessionDate: details.sessionDate,
          title: details.title,
          sessionType: details.sessionType,
          sourceSlug: details.sourceSlug,
          metadata: {
            documents: details.documents,
          },
          updatedAt: new Date(),
        },
      })
      .returning()

    for (const document of details.documents) {
      await db
        .insert(sessionDocuments)
        .values({
          sessionId: sessionRecord.id,
          kind: toDocumentKind(document.kind),
          url: document.url,
        })
        .onConflictDoUpdate({
          target: [sessionDocuments.sessionId, sessionDocuments.kind],
          set: {
            url: document.url,
          },
        })
    }

    persistedSessions.push(sessionRecord)
  }

  return {
    period: periodRecord,
    discoveredSessionCount: sessionUrls.length,
    persistedSessions,
  }
}

export async function discoverAndParsePeriod(periodPageUrl: string) {
  const discovery = await discoverAndPersistPeriod(periodPageUrl)
  const parsed = await parseAttendanceDocumentsForPeriod(discovery.period.id)

  return {
    discovery: {
      period: discovery.period,
      discoveredSessionCount: discovery.discoveredSessionCount,
    },
    parsed,
  }
}

async function getSessionDocument(sessionId: string, kind: DocumentKind) {
  const [row] = await db
    .select({
      document: sessionDocuments,
      session: sessions,
      period: legislativePeriods,
    })
    .from(sessionDocuments)
    .innerJoin(sessions, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(
      and(
        eq(sessionDocuments.sessionId, sessionId),
        eq(sessionDocuments.kind, kind)
      )
    )
    .limit(1)

  return row
}

export async function extractAndPersistSessionDocument(
  sessionId: string,
  kind: DocumentKind
) {
  const row = await getSessionDocument(sessionId, kind)

  if (!row) {
    throw new Error("Session document not found.")
  }

  const extracted = await extractPdfTextFromUrl(row.document.url)

  const [updated] = await db
    .update(sessionDocuments)
    .set({
      rawText: extracted.rawText,
      pageCount: extracted.pageCount,
      extractedAt: new Date(),
      extractionMeta: {
        extractor: "unpdf",
        pages: extracted.pages.length,
      },
    })
    .where(eq(sessionDocuments.id, row.document.id))
    .returning()

  if (kind === "attendance") {
    const inferredSessionType = inferSessionTypeFromAttendanceSource({
      sessionPageUrl: row.session.sessionPageUrl,
      title: row.session.title,
      rawText: extracted.rawText,
      currentSessionType: row.session.sessionType,
    })

    if (inferredSessionType !== row.session.sessionType) {
      await db
        .update(sessions)
        .set({
          sessionType: inferredSessionType,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, row.session.id))
    }
  }

  return {
    ...updated,
    pages: extracted.pages.length,
  }
}

async function createDocumentSnapshotForRow(documentId: string, url: string) {
  const [previousSnapshot] = await db
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.fetchedAt))
    .limit(1)

  const fetchedAt = new Date()

  try {
    const fetched = await fetchPdfFromUrl(url)
    const changed = previousSnapshot?.contentHash !== fetched.contentHash
    const status = previousSnapshot
      ? changed
        ? "changed"
        : "unchanged"
      : "fetched"

    const [snapshot] = await db
      .insert(documentSnapshots)
      .values({
        documentId,
        previousSnapshotId: previousSnapshot?.id ?? null,
        sourceUrl: url,
        status,
        contentHash: fetched.contentHash,
        byteSize: fetched.byteSize,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        contentType: fetched.contentType,
        httpStatus: fetched.httpStatus,
        fetchedAt,
        changedAt: changed || !previousSnapshot ? fetchedAt : null,
        metadata: {
          comparedToSnapshotId: previousSnapshot?.id ?? null,
        },
      })
      .returning()

    await db
      .update(sessionDocuments)
      .set({
        latestContentHash: fetched.contentHash,
        lastCheckedAt: fetchedAt,
        lastChangedAt:
          changed || !previousSnapshot
            ? fetchedAt
            : (previousSnapshot?.changedAt ?? null),
      })
      .where(eq(sessionDocuments.id, documentId))

    return {
      snapshot,
      changed,
      previousSnapshot,
      fetched,
    }
  } catch (error) {
    const [snapshot] = await db
      .insert(documentSnapshots)
      .values({
        documentId,
        previousSnapshotId: previousSnapshot?.id ?? null,
        sourceUrl: url,
        status: "failed",
        httpStatus: null,
        fetchedAt,
        metadata: {
          errorMessage:
            error instanceof Error ? error.message : "Unknown fetch error",
          comparedToSnapshotId: previousSnapshot?.id ?? null,
        },
      })
      .returning()

    await db
      .update(sessionDocuments)
      .set({
        lastCheckedAt: fetchedAt,
      })
      .where(eq(sessionDocuments.id, documentId))

    throw Object.assign(new Error("Failed to create document snapshot."), {
      cause: error,
      snapshotId: snapshot.id,
    })
  }
}

export async function createDocumentSnapshot(documentId: string) {
  const [document] = await db
    .select()
    .from(sessionDocuments)
    .where(eq(sessionDocuments.id, documentId))
    .limit(1)

  if (!document) {
    throw new Error("Document not found.")
  }

  const result = await createDocumentSnapshotForRow(document.id, document.url)

  return {
    documentId: document.id,
    changed: result.changed,
    latestHash: result.snapshot.contentHash,
    previousHash: result.previousSnapshot?.contentHash ?? null,
    status: result.snapshot.status,
    fetchedAt: result.snapshot.fetchedAt,
  }
}

export async function createSessionDocumentSnapshot(
  sessionId: string,
  kind: DocumentKind
) {
  const row = await getSessionDocument(sessionId, kind)

  if (!row) {
    throw new Error("Session document not found.")
  }

  return createDocumentSnapshot(row.document.id)
}

export async function listDocumentSnapshots(documentId: string) {
  return db
    .select()
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.fetchedAt))
}

export async function parseAttendanceDocumentsForPeriod(periodId: string) {
  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title,
      sessionType: sessions.sessionType,
      documentId: sessionDocuments.id,
    })
    .from(sessions)
    .innerJoin(
      sessionDocuments,
      and(
        eq(sessionDocuments.sessionId, sessions.id),
        eq(sessionDocuments.kind, "attendance")
      )
    )
    .where(eq(sessions.periodId, periodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title))

  const results: Array<Record<string, unknown>> = []
  let successCount = 0
  let failureCount = 0

  for (const row of rows) {
    try {
      const parsed = await parseAndPersistAttendanceDocument(row.sessionId)
      successCount += 1
      results.push({
        sessionId: row.sessionId,
        sessionDate: row.sessionDate,
        title: row.title,
        sessionType: row.sessionType,
        status: "parsed",
        ...parsed,
      })
    } catch (error) {
      failureCount += 1
      results.push({
        sessionId: row.sessionId,
        sessionDate: row.sessionDate,
        title: row.title,
        sessionType: row.sessionType,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown parse error",
      })
    }
  }

  return {
    periodId,
    totalSessions: rows.length,
    successCount,
    failureCount,
    results,
  }
}

export async function reconcileSessionAbsences(sessionId: string) {
  const attendanceRow = await getSessionDocument(sessionId, "attendance")
  const absenceRow = await getSessionDocument(sessionId, "absence")

  if (!absenceRow) {
    throw new Error("Absence document not found for the provided session.")
  }

  const parsedAttendanceAbsences = await db
    .select({
      normalizedName: attendanceRecords.normalizedName,
      rawName: attendanceRecords.rawName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
    })
    .from(attendanceRecords)
    .leftJoin(
      parliamentaryGroups,
      eq(attendanceRecords.groupId, parliamentaryGroups.id)
    )
    .where(
      and(
        eq(attendanceRecords.sessionId, sessionId),
        eq(attendanceRecords.status, "absence")
      )
    )

  const fetched = await fetchPdfFromUrl(absenceRow.document.url)
  const extracted = await extractPdfTextFromBytes(fetched.bytes)
  const parsedAbsences = parseAbsencePages(extracted.pages)

  const attendanceByName = new Map(
    parsedAttendanceAbsences.map((record) => [record.normalizedName, record])
  )
  const absenceByName = new Map(
    parsedAbsences.records.map((record) => [record.normalizedName, record])
  )

  const missingFromAttendance = parsedAbsences.records
    .filter((record) => !attendanceByName.has(record.normalizedName))
    .map((record) => ({
      rawName: record.rawName,
      normalizedName: record.normalizedName,
      groupCode: record.groupCode,
      groupName: record.groupName,
    }))

  const extraInAttendance = parsedAttendanceAbsences
    .filter((record) => !absenceByName.has(record.normalizedName))
    .map((record) => ({
      rawName: record.rawName,
      normalizedName: record.normalizedName,
      groupCode: record.groupCode,
      groupName: record.groupName,
    }))

  const attendanceCounts = new Map<string, number>()
  for (const record of parsedAttendanceAbsences) {
    const code = record.groupCode ?? "UNKNOWN"
    attendanceCounts.set(code, (attendanceCounts.get(code) ?? 0) + 1)
  }

  const absenceCounts = new Map(
    parsedAbsences.summaries.map((summary) => [
      summary.groupCode,
      summary.absenceCount,
    ])
  )
  const allGroupCodes = new Set([
    ...attendanceCounts.keys(),
    ...absenceCounts.keys(),
  ])

  const groupDiffs = [...allGroupCodes]
    .map((groupCode) => ({
      groupCode,
      attendanceAbsenceCount: attendanceCounts.get(groupCode) ?? 0,
      absencePdfCount: absenceCounts.get(groupCode) ?? 0,
      difference:
        (attendanceCounts.get(groupCode) ?? 0) -
        (absenceCounts.get(groupCode) ?? 0),
    }))
    .sort((a, b) => a.groupCode.localeCompare(b.groupCode))

  const result = {
    sessionId,
    sessionDate: absenceRow.session.sessionDate,
    title: absenceRow.session.title,
    sessionType: absenceRow.session.sessionType,
    attendanceDocumentId: attendanceRow?.document.id ?? null,
    absenceDocumentId: absenceRow.document.id,
    attendanceSnapshotHash: attendanceRow?.document.latestContentHash ?? null,
    absenceSnapshotHash: fetched.contentHash,
    attendanceAbsenceCount: parsedAttendanceAbsences.length,
    absencePdfCount: parsedAbsences.records.length,
    matches:
      missingFromAttendance.length === 0 && extraInAttendance.length === 0,
    missingFromAttendance,
    extraInAttendance,
    groupDiffs,
  }

  await db
    .insert(sessionReconciliations)
    .values({
      sessionId,
      attendanceDocumentId: attendanceRow?.document.id ?? null,
      absenceDocumentId: absenceRow.document.id,
      attendanceSnapshotHash: attendanceRow?.document.latestContentHash ?? null,
      absenceSnapshotHash: fetched.contentHash,
      matches: result.matches ? "true" : "false",
      attendanceAbsenceCount: result.attendanceAbsenceCount,
      absencePdfCount: result.absencePdfCount,
      missingFromAttendanceCount: result.missingFromAttendance.length,
      extraInAttendanceCount: result.extraInAttendance.length,
      groupDiffCount: result.groupDiffs.filter((diff) => diff.difference !== 0)
        .length,
      details: {
        missingFromAttendance: result.missingFromAttendance,
        extraInAttendance: result.extraInAttendance,
        groupDiffs: result.groupDiffs,
      },
      reconciledAt: new Date(),
    })
    .onConflictDoUpdate({
      target: sessionReconciliations.sessionId,
      set: {
        attendanceDocumentId: attendanceRow?.document.id ?? null,
        absenceDocumentId: absenceRow.document.id,
        attendanceSnapshotHash:
          attendanceRow?.document.latestContentHash ?? null,
        absenceSnapshotHash: fetched.contentHash,
        matches: result.matches ? "true" : "false",
        attendanceAbsenceCount: result.attendanceAbsenceCount,
        absencePdfCount: result.absencePdfCount,
        missingFromAttendanceCount: result.missingFromAttendance.length,
        extraInAttendanceCount: result.extraInAttendance.length,
        groupDiffCount: result.groupDiffs.filter(
          (diff) => diff.difference !== 0
        ).length,
        details: {
          missingFromAttendance: result.missingFromAttendance,
          extraInAttendance: result.extraInAttendance,
          groupDiffs: result.groupDiffs,
        },
        reconciledAt: new Date(),
      },
    })

  return result
}

export async function reconcilePeriodAbsences(periodId: string) {
  const periodSessions = await db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title,
    })
    .from(sessions)
    .innerJoin(
      sessionDocuments,
      and(
        eq(sessionDocuments.sessionId, sessions.id),
        eq(sessionDocuments.kind, "absence")
      )
    )
    .where(eq(sessions.periodId, periodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title))

  const results: Array<Record<string, unknown>> = []
  let matchedSessions = 0
  let mismatchedSessions = 0
  let failedSessions = 0

  for (const session of periodSessions) {
    try {
      const result = await reconcileSessionAbsences(session.sessionId)
      if (result.matches) {
        matchedSessions += 1
      } else {
        mismatchedSessions += 1
      }
      results.push(result)
    } catch (error) {
      failedSessions += 1
      results.push({
        sessionId: session.sessionId,
        sessionDate: session.sessionDate,
        title: session.title,
        error:
          error instanceof Error
            ? error.message
            : "Unknown reconciliation error",
      })
    }
  }

  return {
    periodId,
    totalSessions: periodSessions.length,
    matchedSessions,
    mismatchedSessions,
    failedSessions,
    results,
  }
}

export async function processPeriodPipeline(input: {
  periodId?: string
  periodPageUrl?: string
  forceParseAll?: boolean
  onProgress?: (progress: Record<string, unknown>) => Promise<void> | void
}) {
  let targetPeriodId = input.periodId
  let discoveredSessionCount = 0
  let periodInfo:
    | {
        id: string
        label: string
        legislature: string
        yearSpan: string
        periodPageUrl: string
      }
    | undefined

  if (input.periodPageUrl) {
    const discovery = await discoverAndPersistPeriod(input.periodPageUrl)
    targetPeriodId = discovery.period.id
    discoveredSessionCount = discovery.discoveredSessionCount
    periodInfo = discovery.period
  }

  if (!targetPeriodId) {
    throw new Error("periodId or periodPageUrl is required.")
  }

  if (!periodInfo) {
    const [storedPeriod] = await db
      .select()
      .from(legislativePeriods)
      .where(eq(legislativePeriods.id, targetPeriodId))
      .limit(1)

    if (!storedPeriod) {
      throw new Error("Period not found.")
    }

    periodInfo = storedPeriod
  }

  const periodSessions = await db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title,
      sessionType: sessions.sessionType,
    })
    .from(sessions)
    .where(eq(sessions.periodId, targetPeriodId))
    .orderBy(asc(sessions.sessionDate), asc(sessions.title))

  const results: Array<Record<string, unknown>> = []
  let attendanceSnapshotsCreated = 0
  let absenceSnapshotsCreated = 0
  let parsedSessions = 0
  let skippedParses = 0
  let reconciledSessions = 0
  let reconciliationMismatches = 0
  let failedSessions = 0

  for (const session of periodSessions) {
    const sessionResult: Record<string, unknown> = {
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      title: session.title,
      sessionType: session.sessionType,
    }

    try {
      await input.onProgress?.({
        stage: "session",
        current: results.length + 1,
        total: periodSessions.length,
        sessionId: session.sessionId,
        title: session.title,
      })

      const attendanceDocument = await getSessionDocument(
        session.sessionId,
        "attendance"
      )
      const absenceDocument = await getSessionDocument(
        session.sessionId,
        "absence"
      )

      let attendanceSnapshotChanged = false
      let hasParsedAttendance = false

      if (attendanceDocument) {
        const attendanceSnapshot = await createDocumentSnapshotForRow(
          attendanceDocument.document.id,
          attendanceDocument.document.url
        )
        attendanceSnapshotsCreated += 1
        attendanceSnapshotChanged = attendanceSnapshot.changed
        sessionResult.attendanceSnapshot = {
          documentId: attendanceDocument.document.id,
          status: attendanceSnapshot.snapshot.status,
          changed: attendanceSnapshot.changed,
          contentHash: attendanceSnapshot.snapshot.contentHash,
        }

        const [existingParsed] = await db
          .select({ count: count(attendanceRecords.id) })
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, session.sessionId))

        hasParsedAttendance = Number(existingParsed?.count ?? 0) > 0

        if (
          input.forceParseAll ||
          attendanceSnapshotChanged ||
          !hasParsedAttendance
        ) {
          const parsed = await parseAndPersistAttendanceDocument(
            session.sessionId
          )
          parsedSessions += 1
          sessionResult.parse = {
            status: "parsed",
            ...parsed,
          }
          hasParsedAttendance = true
        } else {
          skippedParses += 1
          sessionResult.parse = {
            status: "skipped",
            reason: "unchanged_snapshot_with_existing_parsed_rows",
          }
        }
      } else {
        sessionResult.parse = {
          status: "skipped",
          reason: "missing_attendance_document",
        }
      }

      if (absenceDocument) {
        const absenceSnapshot = await createDocumentSnapshotForRow(
          absenceDocument.document.id,
          absenceDocument.document.url
        )
        absenceSnapshotsCreated += 1
        sessionResult.absenceSnapshot = {
          documentId: absenceDocument.document.id,
          status: absenceSnapshot.snapshot.status,
          changed: absenceSnapshot.changed,
          contentHash: absenceSnapshot.snapshot.contentHash,
        }
      }

      if (absenceDocument && hasParsedAttendance) {
        const reconciliation = await reconcileSessionAbsences(session.sessionId)
        reconciledSessions += 1
        if (!reconciliation.matches) {
          reconciliationMismatches += 1
        }
        sessionResult.reconciliation = {
          matches: reconciliation.matches,
          attendanceAbsenceCount: reconciliation.attendanceAbsenceCount,
          absencePdfCount: reconciliation.absencePdfCount,
          missingFromAttendanceCount:
            reconciliation.missingFromAttendance.length,
          extraInAttendanceCount: reconciliation.extraInAttendance.length,
          groupDiffs: reconciliation.groupDiffs,
        }
      } else {
        sessionResult.reconciliation = {
          status: "skipped",
          reason: absenceDocument
            ? "attendance_not_parsed"
            : "missing_absence_document",
        }
      }

      results.push(sessionResult)
    } catch (error) {
      failedSessions += 1
      results.push({
        ...sessionResult,
        error:
          error instanceof Error ? error.message : "Unknown pipeline error",
      })
    }
  }

  return {
    period: periodInfo,
    discoveredSessionCount,
    totalSessions: periodSessions.length,
    attendanceSnapshotsCreated,
    absenceSnapshotsCreated,
    parsedSessions,
    skippedParses,
    reconciledSessions,
    reconciliationMismatches,
    failedSessions,
    results,
  }
}

export async function processAllPeriodsPipeline(input: {
  legislature?: string
  forceParseAll?: boolean
  onProgress?: (progress: Record<string, unknown>) => Promise<void> | void
}) {
  const remotePeriods = await fetchAttendancePeriods()
  const targetPeriods = input.legislature
    ? remotePeriods.filter((period) => period.legislature === input.legislature)
    : remotePeriods

  const results: Array<Record<string, unknown>> = []
  let processedPeriods = 0
  let failedPeriods = 0

  for (const period of targetPeriods) {
    try {
      await input.onProgress?.({
        stage: "period",
        current: results.length + 1,
        total: targetPeriods.length,
        periodPageUrl: period.periodPageUrl,
        label: period.label,
        legislature: period.legislature,
      })

      const result = await processPeriodPipeline({
        periodPageUrl: period.periodPageUrl,
        forceParseAll: input.forceParseAll,
        onProgress: async (progress) => {
          await input.onProgress?.({
            ...progress,
            outerCurrent: results.length + 1,
            outerTotal: targetPeriods.length,
            outerPeriodLabel: period.label,
            outerLegislature: period.legislature,
          })
        },
      })

      processedPeriods += 1
      results.push(result)
    } catch (error) {
      failedPeriods += 1
      results.push({
        period,
        error: error instanceof Error ? error.message : "Unknown process error",
      })
    }
  }

  return {
    legislature: input.legislature ?? null,
    totalPeriods: targetPeriods.length,
    processedPeriods,
    failedPeriods,
    results,
  }
}

export async function parseAndPersistAttendanceDocument(sessionId: string) {
  const row = await getSessionDocument(sessionId, "attendance")

  if (!row) {
    throw new Error("Attendance document not found for the provided session.")
  }

  const snapshotResult = await createDocumentSnapshotForRow(
    row.document.id,
    row.document.url
  )
  const extracted = await extractPdfTextFromBytes(snapshotResult.fetched.bytes)
  const parsed = parseAttendancePages(extracted.pages)
  const legislature =
    row.period?.legislature ??
    inferLegislatureFromSessionUrl(row.session.sessionPageUrl)

  if (parsed.records.length === 0) {
    throw new Error("No attendance rows were parsed from the attendance PDF.")
  }

  return db.transaction(async (tx) => {
    const [parseRun] = await tx
      .insert(documentParseRuns)
      .values({
        documentId: row.document.id,
        parserVersion: ATTENDANCE_PARSER_VERSION,
        status: "running",
      })
      .returning()

    await tx
      .update(sessionDocuments)
      .set({
        rawText: extracted.rawText,
        pageCount: extracted.pageCount,
        extractedAt: new Date(),
        extractionMeta: {
          extractor: "unpdf",
          parserVersion: ATTENDANCE_PARSER_VERSION,
          pages: extracted.pages.length,
        },
      })
      .where(eq(sessionDocuments.id, row.document.id))

    const inferredSessionType = inferSessionTypeFromAttendanceSource({
      sessionPageUrl: row.session.sessionPageUrl,
      title: row.session.title,
      rawText: extracted.rawText,
      currentSessionType: row.session.sessionType,
    })

    if (inferredSessionType !== row.session.sessionType) {
      await tx
        .update(sessions)
        .set({
          sessionType: inferredSessionType,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, row.session.id))
    }

    await tx
      .delete(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, row.session.id))
    await tx
      .delete(sessionGroupSummaries)
      .where(eq(sessionGroupSummaries.sessionId, row.session.id))

    await tx
      .delete(ingestAnomalies)
      .where(eq(ingestAnomalies.documentId, row.document.id))

    const groupIdsByCode = new Map<string, string>()

    for (const summary of parsed.summaries) {
      const [group] = await tx
        .insert(parliamentaryGroups)
        .values({
          legislature,
          code: summary.groupCode,
          name: summary.groupName || formatGroupName(summary.groupCode),
        })
        .onConflictDoUpdate({
          target: [parliamentaryGroups.legislature, parliamentaryGroups.code],
          set: {
            name: summary.groupName || formatGroupName(summary.groupCode),
          },
        })
        .returning()

      groupIdsByCode.set(summary.groupCode, group.id)

      await tx.insert(sessionGroupSummaries).values({
        sessionId: row.session.id,
        groupId: group.id,
        sourceDocumentId: row.document.id,
        attendanceCount: summary.attendanceCount,
        cedulaCount: summary.cedulaCount,
        justifiedAbsenceCount: summary.justifiedAbsenceCount,
        absenceCount: summary.absenceCount,
        officialCommissionCount: summary.officialCommissionCount,
        boardLeaveCount: summary.boardLeaveCount,
        notPresentInVotesCount: summary.notPresentInVotesCount,
        totalCount: summary.totalCount,
        rawLabel: summary.groupName,
      })
    }

    for (const record of parsed.records) {
      const groupId = groupIdsByCode.get(record.groupCode) ?? null
      const personId = await resolvePersonId(tx, {
        fullName: record.rawName,
        normalizedName: record.normalizedName,
        metadata: {
          latestSourceDocumentId: row.document.id,
        },
      })

      const [legislator] = await tx
        .insert(legislators)
        .values({
          personId,
          legislature,
          fullName: record.rawName,
          normalizedName: record.normalizedName,
          currentGroupId: groupId,
          displayOrderHint: record.rowNumber,
          metadata: {
            latestSourceDocumentId: row.document.id,
          },
        })
        .onConflictDoUpdate({
          target: [legislators.legislature, legislators.normalizedName],
          set: {
            personId,
            fullName: record.rawName,
            currentGroupId: groupId,
            displayOrderHint: record.rowNumber,
            updatedAt: new Date(),
            metadata: {
              latestSourceDocumentId: row.document.id,
            },
          },
        })
        .returning()

      await tx.insert(attendanceRecords).values({
        sessionId: row.session.id,
        legislatorId: legislator.id,
        groupId,
        sourceDocumentId: row.document.id,
        sourceParseRunId: parseRun.id,
        rowNumber: record.rowNumber,
        pageNumber: record.pageNumber,
        rawName: record.rawName,
        normalizedName: record.normalizedName,
        status: record.status,
        rawStatus: record.rawStatus,
        confidence: 100,
        metadata: {
          groupCode: record.groupCode,
          groupName: record.groupName,
        },
      })
    }

    await tx
      .update(documentParseRuns)
      .set({
        status: "completed",
        finishedAt: new Date(),
        metrics: {
          snapshotId: snapshotResult.snapshot.id,
          snapshotStatus: snapshotResult.snapshot.status,
          pageCount: extracted.pageCount,
          recordCount: parsed.records.length,
          summaryCount: parsed.summaries.length,
          parserVersion: ATTENDANCE_PARSER_VERSION,
        },
      })
      .where(eq(documentParseRuns.id, parseRun.id))

    const anomalyRows = buildAttendanceParseAnomalies(parsed, {
      sessionId: row.session.id,
      documentId: row.document.id,
      parseRunId: parseRun.id,
      sourceUrl: row.document.url,
    })

    if (anomalyRows.length > 0) {
      await tx.insert(ingestAnomalies).values(anomalyRows)
    }

    return {
      documentId: row.document.id,
      snapshotId: snapshotResult.snapshot.id,
      snapshotChanged: snapshotResult.changed,
      parseRunId: parseRun.id,
      pageCount: extracted.pageCount,
      recordCount: parsed.records.length,
      summaryCount: parsed.summaries.length,
    }
  })
}

export async function listStoredSessions() {
  return db.select().from(sessions).orderBy(desc(sessions.sessionDate))
}

export async function listStoredDocuments() {
  return db
    .select()
    .from(sessionDocuments)
    .orderBy(desc(sessionDocuments.createdAt))
}

function buildLegislatorWhereClause(scope: AnalyticsScope, search?: string) {
  const clauses = []

  if (search) {
    clauses.push(...buildNormalizedNameSearchClauses(legislators.normalizedName, search))
  }

  if (scope.legislature) {
    clauses.push(eq(legislators.legislature, scope.legislature))
  }

  if (scope.periodId) {
    clauses.push(eq(sessions.periodId, scope.periodId))
  }

  if (clauses.length === 0) return undefined
  if (clauses.length === 1) return clauses[0]
  return and(...clauses)
}

async function resolvePersonId(
  tx: Pick<typeof db, "select" | "insert">,
  input: {
    fullName: string
    normalizedName: string
    metadata?: Record<string, unknown>
  }
) {
  const [existing] = await tx
    .select({
      id: people.id,
    })
    .from(people)
    .where(eq(people.normalizedName, input.normalizedName))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [created] = await tx
    .insert(people)
    .values({
      fullName: input.fullName,
      normalizedName: input.normalizedName,
      metadata: input.metadata ?? null,
    })
    .onConflictDoNothing({ target: people.normalizedName })
    .returning({
      id: people.id,
    })

  if (created) {
    return created.id
  }

  const [conflicted] = await tx
    .select({
      id: people.id,
    })
    .from(people)
    .where(eq(people.normalizedName, input.normalizedName))
    .limit(1)

  if (!conflicted) {
    throw new Error(`Failed to resolve person for ${input.fullName}.`)
  }

  return conflicted.id
}

function buildNormalizedNameSearchClauses(
  column: typeof legislators.normalizedName | typeof people.normalizedName,
  search: string
) {
  const normalizedSearch = normalizeName(search)
  const tokens = normalizedSearch.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return []

  return tokens.map((token) => ilike(column, `%${token}%`))
}

function extractProfileMetadata(metadata: unknown) {
  const record = metadata as Record<string, unknown> | null

  return {
    imageUrl: (record?.imageUrl as string | null) ?? null,
    bio: (record?.bio as string | null) ?? null,
  }
}

function sortItems<T>(
  items: T[],
  getValue: (item: T) => string | number | null,
  order: SortOrder
) {
  return [...items].sort((a, b) => {
    const av = getValue(a)
    const bv = getValue(b)

    if (av === bv) return 0
    if (av === null) return 1
    if (bv === null) return -1

    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : Number(av) - Number(bv)

    return order === "asc" ? cmp : -cmp
  })
}

export async function listLegislators(
  search?: string,
  scope: AnalyticsScope = {},
  sort: LegislatorSort = "name",
  order: SortOrder = "asc"
) {
  const whereClause = buildLegislatorWhereClause(scope, search)

  const rows = await db
    .select({
      id: legislators.id,
      personId: legislators.personId,
      fullName: legislators.fullName,
      legislature: legislators.legislature,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      personMetadata: people.metadata,
      sessionsMentioned: sql<number>`count(${attendanceRecords.id})::int`,
      attendanceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'attendance' then 1 else 0 end)::int`,
      cedulaCount: sql<number>`sum(case when ${attendanceRecords.status} = 'cedula' then 1 else 0 end)::int`,
      justifiedAbsenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'justified_absence' then 1 else 0 end)::int`,
      absenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'absence' then 1 else 0 end)::int`,
      officialCommissionCount: sql<number>`sum(case when ${attendanceRecords.status} = 'official_commission' then 1 else 0 end)::int`,
      boardLeaveCount: sql<number>`sum(case when ${attendanceRecords.status} = 'board_leave' then 1 else 0 end)::int`,
      notPresentInVotesCount: sql<number>`sum(case when ${attendanceRecords.status} = 'not_present_in_votes' then 1 else 0 end)::int`,
    })
    .from(legislators)
    .leftJoin(
      parliamentaryGroups,
      eq(legislators.currentGroupId, parliamentaryGroups.id)
    )
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(
      attendanceRecords,
      eq(attendanceRecords.legislatorId, legislators.id)
    )
    .leftJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .where(whereClause)
    .groupBy(
      legislators.id,
      legislators.personId,
      legislators.fullName,
      legislators.legislature,
      people.metadata,
      parliamentaryGroups.code,
      parliamentaryGroups.name
    )

  const enriched = rows.map((row) => {
    const { personMetadata, ...publicRow } = row
    const attendanceRatio =
      row.sessionsMentioned > 0
        ? row.attendanceCount / row.sessionsMentioned
        : 0
    const absenceRatio =
      row.sessionsMentioned > 0
        ? (row.absenceCount + row.justifiedAbsenceCount) / row.sessionsMentioned
        : 0

    return {
      ...publicRow,
      ...extractProfileMetadata(personMetadata),
      attendanceRatio,
      absenceRatio,
    }
  })

  const sortMap: Record<
    LegislatorSort,
    (item: (typeof enriched)[number]) => string | number | null
  > = {
    name: (item) => item.fullName,
    attendance_ratio: (item) => item.attendanceRatio,
    attendance_count: (item) => item.attendanceCount,
    absence_count: (item) => item.absenceCount,
    justified_absence_count: (item) => item.justifiedAbsenceCount,
    sessions_mentioned: (item) => item.sessionsMentioned,
  }

  return sortItems(enriched, sortMap[sort], order)
}

export async function getLegislatorById(legislatorId: string) {
  const [summary] = await db
    .select({
      id: legislators.id,
      personId: legislators.personId,
      fullName: legislators.fullName,
      normalizedName: legislators.normalizedName,
      legislature: legislators.legislature,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      personMetadata: people.metadata,
      sessionsMentioned: sql<number>`count(${attendanceRecords.id})::int`,
      attendanceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'attendance' then 1 else 0 end)::int`,
      cedulaCount: sql<number>`sum(case when ${attendanceRecords.status} = 'cedula' then 1 else 0 end)::int`,
      justifiedAbsenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'justified_absence' then 1 else 0 end)::int`,
      absenceCount: sql<number>`sum(case when ${attendanceRecords.status} = 'absence' then 1 else 0 end)::int`,
      officialCommissionCount: sql<number>`sum(case when ${attendanceRecords.status} = 'official_commission' then 1 else 0 end)::int`,
      boardLeaveCount: sql<number>`sum(case when ${attendanceRecords.status} = 'board_leave' then 1 else 0 end)::int`,
      notPresentInVotesCount: sql<number>`sum(case when ${attendanceRecords.status} = 'not_present_in_votes' then 1 else 0 end)::int`,
    })
    .from(legislators)
    .leftJoin(
      parliamentaryGroups,
      eq(legislators.currentGroupId, parliamentaryGroups.id)
    )
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(
      attendanceRecords,
      eq(attendanceRecords.legislatorId, legislators.id)
    )
    .where(eq(legislators.id, legislatorId))
    .groupBy(
      legislators.id,
      legislators.personId,
      legislators.fullName,
      legislators.normalizedName,
      legislators.legislature,
      people.metadata,
      parliamentaryGroups.code,
      parliamentaryGroups.name
    )
    .limit(1)

  if (!summary) {
    throw new Error("Legislator not found.")
  }

  const relatedRows = await db
    .select({
      id: legislators.id,
      legislature: legislators.legislature,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
    })
    .from(legislators)
    .leftJoin(
      parliamentaryGroups,
      eq(legislators.currentGroupId, parliamentaryGroups.id)
    )
    .where(eq(legislators.personId, summary.personId))

  const sortedRelatedRows = [...relatedRows].sort(
    (left, right) =>
      legislatureRank(right.legislature) - legislatureRank(left.legislature)
  )

  const {
    normalizedName: _normalizedName,
    personMetadata,
    ...publicSummary
  } = summary

  return {
    ...publicSummary,
    ...extractProfileMetadata(personMetadata),
    relatedLegislatures: sortedRelatedRows.map((row) => ({
      id: row.id,
      legislature: row.legislature,
      groupCode: row.groupCode,
      groupName: row.groupName,
      isCurrent: row.id === summary.id,
    })),
  }
}

export async function listPeople(input: {
  search?: string
  legislature?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 24))
  const clauses = []

  if (input.search) {
    clauses.push(...buildNormalizedNameSearchClauses(people.normalizedName, input.search))
  }

  if (input.legislature) {
    clauses.push(eq(legislators.legislature, input.legislature))
  }

  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const rows = await db
    .select({
      personId: people.id,
      id: people.id,
      legislatorId: legislators.id,
      fullName: legislators.fullName,
      normalizedName: people.normalizedName,
      legislature: legislators.legislature,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      personMetadata: people.metadata,
    })
    .from(legislators)
    .innerJoin(people, eq(legislators.personId, people.id))
    .leftJoin(
      parliamentaryGroups,
      eq(legislators.currentGroupId, parliamentaryGroups.id)
    )
    .where(whereClause)
    .orderBy(asc(legislators.fullName))
  const dedupedRows = input.legislature
    ? rows
    : [...dedupePeopleRows(rows).values()]
  const pagedRows = dedupedRows.slice((page - 1) * pageSize, page * pageSize)

  return {
    page,
    pageSize,
    total: dedupedRows.length,
    items: pagedRows.map((item) => {
      const { personMetadata, ...publicItem } = item

      return {
        ...publicItem,
        ...extractProfileMetadata(personMetadata),
      }
    }),
  }
}

function dedupePeopleRows<
  T extends {
    personId: string
    legislature: string
    personMetadata: unknown
  },
>(rows: T[]) {
  const deduped = new Map<string, T>()

  for (const row of rows) {
    const current = deduped.get(row.personId)

    if (!current) {
      deduped.set(row.personId, row)
      continue
    }

    if (comparePeopleRows(row, current) < 0) {
      deduped.set(row.personId, row)
    }
  }

  return deduped
}

function comparePeopleRows<
  T extends {
    legislature: string
    personMetadata: unknown
  },
>(left: T, right: T) {
  const legislatureDiff =
    legislatureRank(right.legislature) - legislatureRank(left.legislature)

  if (legislatureDiff !== 0) return legislatureDiff

  const leftHasProfile = hasProfileData(left.personMetadata)
  const rightHasProfile = hasProfileData(right.personMetadata)

  if (leftHasProfile !== rightHasProfile) {
    return rightHasProfile ? 1 : -1
  }

  return 0
}

function legislatureRank(value: string) {
  const map: Record<string, number> = {
    LX: 60,
    LXI: 61,
    LXII: 62,
    LXIII: 63,
    LXIV: 64,
    LXV: 65,
    LXVI: 66,
    LXVII: 67,
    LXVIII: 68,
  }

  return map[value.toUpperCase()] ?? 0
}

async function resolveLegislatorIdForPerson(
  personId: string,
  legislature?: string
) {
  const rows = await db
    .select({
      id: legislators.id,
      legislature: legislators.legislature,
    })
    .from(legislators)
    .where(eq(legislators.personId, personId))

  if (rows.length === 0) {
    throw new Error("Person not found.")
  }

  if (legislature) {
    const exact = rows.find((row) => row.legislature === legislature)

    if (exact) {
      return exact.id
    }
  }

  const fallback = [...rows].sort(
    (left, right) =>
      legislatureRank(right.legislature) - legislatureRank(left.legislature)
  )[0]

  if (!fallback) {
    throw new Error("Person not found.")
  }

  return fallback.id
}

function hasProfileData(metadata: unknown) {
  const record = metadata as Record<string, unknown> | null

  return Boolean(record?.imageUrl || record?.bio)
}

export async function updateLegislatorProfile(
  legislatorId: string,
  input: {
    imageUrl?: string | null
    bio?: string | null
  }
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
    .limit(1)

  if (!existing) {
    throw new Error("Legislator not found.")
  }

  const currentMetadata =
    (existing.personMetadata as Record<string, unknown> | null) ?? {}

  const [updated] = await db
    .update(people)
    .set({
      metadata: {
        ...currentMetadata,
        imageUrl: input.imageUrl ?? null,
        bio: input.bio ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(people.id, existing.personId))
    .returning({
      id: people.id,
      metadata: people.metadata,
      updatedAt: people.updatedAt,
    })

  return updated
}

export async function getPersonById(personId: string, legislature?: string) {
  const legislatorId = await resolveLegislatorIdForPerson(personId, legislature)

  return getLegislatorById(legislatorId)
}

export async function getPersonAttendanceHistory(
  personId: string,
  legislature?: string
) {
  const legislatorId = await resolveLegislatorIdForPerson(personId, legislature)

  return getLegislatorAttendanceHistory(legislatorId)
}

export async function getPersonTrend(
  personId: string,
  scope: AnalyticsScope = {}
) {
  const legislatorId = await resolveLegislatorIdForPerson(
    personId,
    scope.legislature
  )

  return getLegislatorTrend(legislatorId, scope)
}

export async function getLegislatorAttendanceHistory(legislatorId: string) {
  return db
    .select({
      attendanceRecordId: attendanceRecords.id,
      status: attendanceRecords.status,
      rawStatus: attendanceRecords.rawStatus,
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      sessionType: sessions.sessionType,
      title: sessions.title,
      sessionPageUrl: sessions.sessionPageUrl,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
    })
    .from(attendanceRecords)
    .innerJoin(sessions, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(
      parliamentaryGroups,
      eq(attendanceRecords.groupId, parliamentaryGroups.id)
    )
    .where(eq(attendanceRecords.legislatorId, legislatorId))
    .orderBy(desc(sessions.sessionDate), desc(attendanceRecords.createdAt))
}

export async function getSessionsWithParsedAttendance() {
  return db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title,
      sessionType: sessions.sessionType,
      attendanceRecordCount: count(attendanceRecords.id),
    })
    .from(sessions)
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .groupBy(
      sessions.id,
      sessions.sessionDate,
      sessions.title,
      sessions.sessionType
    )
    .orderBy(desc(sessions.sessionDate))
}

export async function getAnalyticsOverview(scope: AnalyticsScope = {}) {
  const sessionWhere = []
  if (scope.periodId) sessionWhere.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    sessionWhere.push(eq(legislativePeriods.legislature, scope.legislature))
  if (!scope.includePermanent)
    sessionWhere.push(ne(sessions.sessionType, "permanent"))
  const combinedWhere =
    sessionWhere.length === 0
      ? undefined
      : sessionWhere.length === 1
        ? sessionWhere[0]
        : and(...sessionWhere)

  const [sessionsSummary] = await db
    .select({
      totalSessions: sql<number>`count(distinct ${sessions.id})::int`,
      parsedSessions: sql<number>`count(distinct case when ${attendanceRecords.id} is not null then ${sessions.id} end)::int`,
      legislatorsCount: sql<number>`count(distinct ${attendanceRecords.legislatorId})::int`,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .where(combinedWhere)

  const [statusSummary] = await db
    .select({
      attendanceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.attendanceCount}), 0)::int`,
      cedulaCount: sql<number>`coalesce(sum(${sessionGroupSummaries.cedulaCount}), 0)::int`,
      justifiedAbsenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.justifiedAbsenceCount}), 0)::int`,
      absenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.absenceCount}), 0)::int`,
      officialCommissionCount: sql<number>`coalesce(sum(${sessionGroupSummaries.officialCommissionCount}), 0)::int`,
      boardLeaveCount: sql<number>`coalesce(sum(${sessionGroupSummaries.boardLeaveCount}), 0)::int`,
      notPresentInVotesCount: sql<number>`coalesce(sum(${sessionGroupSummaries.notPresentInVotesCount}), 0)::int`,
      totalMentions: sql<number>`coalesce(sum(${sessionGroupSummaries.totalCount}), 0)::int`,
    })
    .from(sessionGroupSummaries)
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(combinedWhere)

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
  }
}

export async function listPartyAnalytics(
  scope: AnalyticsScope = {},
  order: SortOrder = "desc"
) {
  const clauses = []
  if (scope.periodId) clauses.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    clauses.push(eq(parliamentaryGroups.legislature, scope.legislature))
  if (!scope.includePermanent)
    clauses.push(ne(sessions.sessionType, "permanent"))
  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const rows = await db
    .select({
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      legislature: parliamentaryGroups.legislature,
      sessionCount: sql<number>`count(distinct ${sessions.id})::int`,
      attendanceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.attendanceCount}), 0)::int`,
      cedulaCount: sql<number>`coalesce(sum(${sessionGroupSummaries.cedulaCount}), 0)::int`,
      justifiedAbsenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.justifiedAbsenceCount}), 0)::int`,
      absenceCount: sql<number>`coalesce(sum(${sessionGroupSummaries.absenceCount}), 0)::int`,
      officialCommissionCount: sql<number>`coalesce(sum(${sessionGroupSummaries.officialCommissionCount}), 0)::int`,
      boardLeaveCount: sql<number>`coalesce(sum(${sessionGroupSummaries.boardLeaveCount}), 0)::int`,
      notPresentInVotesCount: sql<number>`coalesce(sum(${sessionGroupSummaries.notPresentInVotesCount}), 0)::int`,
      totalCount: sql<number>`coalesce(sum(${sessionGroupSummaries.totalCount}), 0)::int`,
    })
    .from(sessionGroupSummaries)
    .innerJoin(
      parliamentaryGroups,
      eq(sessionGroupSummaries.groupId, parliamentaryGroups.id)
    )
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .where(whereClause)
    .groupBy(
      parliamentaryGroups.code,
      parliamentaryGroups.name,
      parliamentaryGroups.legislature
    )

  const enriched = rows.map((row) => ({
    ...row,
    attendanceRatio:
      row.totalCount > 0 ? row.attendanceCount / row.totalCount : 0,
    absenceRatio:
      row.totalCount > 0
        ? (row.absenceCount + row.justifiedAbsenceCount) / row.totalCount
        : 0,
    justifiedAbsenceRatio:
      row.totalCount > 0 ? row.justifiedAbsenceCount / row.totalCount : 0,
  }))

  return sortItems(enriched, (item) => item.attendanceRatio, order)
}

export async function getPartyTrends(scope: AnalyticsScope = {}) {
  const clauses = []
  if (scope.periodId) clauses.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    clauses.push(eq(parliamentaryGroups.legislature, scope.legislature))
  if (!scope.includePermanent)
    clauses.push(ne(sessions.sessionType, "permanent"))
  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      sessionType: sessions.sessionType,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      attendanceCount: sessionGroupSummaries.attendanceCount,
      cedulaCount: sessionGroupSummaries.cedulaCount,
      justifiedAbsenceCount: sessionGroupSummaries.justifiedAbsenceCount,
      absenceCount: sessionGroupSummaries.absenceCount,
      officialCommissionCount: sessionGroupSummaries.officialCommissionCount,
      boardLeaveCount: sessionGroupSummaries.boardLeaveCount,
      notPresentInVotesCount: sessionGroupSummaries.notPresentInVotesCount,
      totalCount: sessionGroupSummaries.totalCount,
    })
    .from(sessionGroupSummaries)
    .innerJoin(
      parliamentaryGroups,
      eq(sessionGroupSummaries.groupId, parliamentaryGroups.id)
    )
    .innerJoin(sessions, eq(sessionGroupSummaries.sessionId, sessions.id))
    .where(whereClause)
    .orderBy(asc(sessions.sessionDate), asc(parliamentaryGroups.code))

  const grouped = new Map<
    string,
    {
      key: string
      label: string
      pointsByDate: Map<
        string,
        {
          sessionDate: string | null
          sessionId: string
          sessionType: string
          aggregatedSessionCount: number
          attendanceCount: number
          cedulaCount: number
          officialCommissionCount: number
          absenceCount: number
          justifiedAbsenceCount: number
          totalCount: number
        }
      >
      points: Array<{
        sessionDate: string | null
        sessionId: string
        sessionType: string
        aggregatedSessionCount: number
        attendanceRatio: number
        participationRatio: number
        resolvedRatio: number
        absenceRatio: number
        justifiedAbsenceRatio: number
        unexcusedAbsenceRatio: number
        attendanceCount: number
        cedulaCount: number
        officialCommissionCount: number
        absenceCount: number
        justifiedAbsenceCount: number
        totalCount: number
      }>
    }
  >()

  for (const row of rows) {
    const existing = grouped.get(row.groupCode) ?? {
      key: row.groupCode,
      label: row.groupName,
      pointsByDate: new Map(),
      points: [],
    }

    const dateKey = row.sessionDate
      ? row.sessionDate.toISOString()
      : `session:${row.sessionId}`
    const existingPoint = existing.pointsByDate.get(dateKey) ?? {
      sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
      sessionId: row.sessionId,
      sessionType: row.sessionType,
      aggregatedSessionCount: 1,
      attendanceCount: row.attendanceCount,
      cedulaCount: row.cedulaCount,
      officialCommissionCount: row.officialCommissionCount,
      absenceCount: row.absenceCount,
      justifiedAbsenceCount: row.justifiedAbsenceCount,
      totalCount: row.totalCount,
    }

    if (existing.pointsByDate.has(dateKey)) {
      existingPoint.sessionType =
        existingPoint.sessionType === row.sessionType
          ? row.sessionType
          : "mixed"
      existingPoint.aggregatedSessionCount += 1
      existingPoint.attendanceCount += row.attendanceCount
      existingPoint.cedulaCount += row.cedulaCount
      existingPoint.officialCommissionCount += row.officialCommissionCount
      existingPoint.absenceCount += row.absenceCount
      existingPoint.justifiedAbsenceCount += row.justifiedAbsenceCount
      existingPoint.totalCount += row.totalCount
    }

    existing.pointsByDate.set(dateKey, existingPoint)

    grouped.set(row.groupCode, existing)
  }

  return {
    scope,
    series: [...grouped.values()].map((series) => ({
      key: series.key,
      label: series.label,
      points: [...series.pointsByDate.values()]
        .map((point) => {
          const attendanceRatio =
            point.totalCount > 0 ? point.attendanceCount / point.totalCount : 0
          const participationRatio =
            point.totalCount > 0
              ? (point.attendanceCount +
                  point.cedulaCount +
                  point.officialCommissionCount) /
                point.totalCount
              : 0
          const resolvedRatio =
            point.totalCount > 0
              ? (point.attendanceCount +
                  point.cedulaCount +
                  point.officialCommissionCount +
                  point.justifiedAbsenceCount) /
                point.totalCount
              : 0
          const absenceRatio =
            point.totalCount > 0
              ? (point.absenceCount + point.justifiedAbsenceCount) /
                point.totalCount
              : 0
          const justifiedAbsenceRatio =
            point.totalCount > 0
              ? point.justifiedAbsenceCount / point.totalCount
              : 0
          const unexcusedAbsenceRatio =
            point.totalCount > 0 ? point.absenceCount / point.totalCount : 0

          return {
            ...point,
            attendanceRatio,
            participationRatio,
            resolvedRatio,
            absenceRatio,
            justifiedAbsenceRatio,
            unexcusedAbsenceRatio,
          }
        })
        .sort((a, b) =>
          (a.sessionDate ?? a.sessionId).localeCompare(
            b.sessionDate ?? b.sessionId
          )
        ),
    })),
  }
}

export async function getLegislatorTrend(
  legislatorId: string,
  scope: AnalyticsScope = {}
) {
  const clauses = [eq(attendanceRecords.legislatorId, legislatorId)]
  if (scope.periodId) clauses.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    clauses.push(eq(legislators.legislature, scope.legislature))
  const whereClause = clauses.length === 1 ? clauses[0] : and(...clauses)

  const [legislator] = await db
    .select({
      id: legislators.id,
      fullName: legislators.fullName,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      legislature: legislators.legislature,
    })
    .from(legislators)
    .leftJoin(
      parliamentaryGroups,
      eq(legislators.currentGroupId, parliamentaryGroups.id)
    )
    .where(eq(legislators.id, legislatorId))
    .limit(1)

  if (!legislator) {
    throw new Error("Legislator not found.")
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
    .orderBy(asc(sessions.sessionDate), asc(sessions.title))

  return {
    legislator,
    points: rows.map((row) => ({
      sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
      sessionId: row.sessionId,
      sessionType: row.sessionType,
      title: row.title,
      status: row.status,
      value:
        row.status === "attendance" ||
        row.status === "cedula" ||
        row.status === "official_commission" ||
        row.status === "board_leave"
          ? 1
          : 0,
    })),
  }
}

export async function getSessionComposition(sessionId: string) {
  const [session] = await db
    .select({
      sessionId: sessions.id,
      title: sessions.title,
      sessionDate: sessions.sessionDate,
      sessionType: sessions.sessionType,
      legislature: legislativePeriods.legislature,
      periodId: sessions.periodId,
      periodLabel: legislativePeriods.label,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  if (!session) {
    throw new Error("Session not found.")
  }

  const parties = await db
    .select({
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
      attendanceCount: sessionGroupSummaries.attendanceCount,
      cedulaCount: sessionGroupSummaries.cedulaCount,
      justifiedAbsenceCount: sessionGroupSummaries.justifiedAbsenceCount,
      absenceCount: sessionGroupSummaries.absenceCount,
      officialCommissionCount: sessionGroupSummaries.officialCommissionCount,
      boardLeaveCount: sessionGroupSummaries.boardLeaveCount,
      notPresentInVotesCount: sessionGroupSummaries.notPresentInVotesCount,
      totalCount: sessionGroupSummaries.totalCount,
    })
    .from(sessionGroupSummaries)
    .innerJoin(
      parliamentaryGroups,
      eq(sessionGroupSummaries.groupId, parliamentaryGroups.id)
    )
    .where(eq(sessionGroupSummaries.sessionId, sessionId))
    .orderBy(asc(parliamentaryGroups.code))

  return {
    sessionId: session.sessionId,
    title: session.title,
    sessionDate: session.sessionDate ? session.sessionDate.toISOString() : null,
    sessionType: session.sessionType,
    legislature: session.legislature,
    periodId: session.periodId,
    periodLabel: session.periodLabel,
    parties: parties.map((party) => ({
      ...party,
      attendanceRatio:
        party.totalCount > 0 ? party.attendanceCount / party.totalCount : 0,
      absenceRatio:
        party.totalCount > 0
          ? (party.absenceCount + party.justifiedAbsenceCount) /
            party.totalCount
          : 0,
      justifiedAbsenceRatio:
        party.totalCount > 0
          ? party.justifiedAbsenceCount / party.totalCount
          : 0,
    })),
  }
}

export async function getQualityOverview(scope: AnalyticsScope = {}) {
  const clauses = []
  if (scope.periodId) clauses.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    clauses.push(eq(legislativePeriods.legislature, scope.legislature))
  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const [summary] = await db
    .select({
      totalSessions: sql<number>`count(distinct ${sessions.id})::int`,
      sessionsWithAttendanceDoc: sql<number>`count(distinct case when ${sessionDocuments.kind} = 'attendance' then ${sessions.id} end)::int`,
      sessionsWithAbsenceDoc: sql<number>`count(distinct case when ${sessionDocuments.kind} = 'absence' then ${sessions.id} end)::int`,
      parsedSessions: sql<number>`count(distinct case when ${attendanceRecords.id} is not null then ${sessions.id} end)::int`,
      reconciledSessions: sql<number>`count(distinct case when ${sessionReconciliations.id} is not null then ${sessions.id} end)::int`,
      matchedSessions: sql<number>`count(distinct case when ${sessionReconciliations.matches} = 'true' then ${sessions.id} end)::int`,
      mismatchedSessions: sql<number>`count(distinct case when ${sessionReconciliations.matches} = 'false' then ${sessions.id} end)::int`,
      changedDocuments: sql<number>`count(distinct case when ${documentSnapshots.status} = 'changed' then ${sessionDocuments.id} end)::int`,
      failedSnapshots: sql<number>`count(distinct case when ${documentSnapshots.status} = 'failed' then ${sessionDocuments.id} end)::int`,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(sessionDocuments, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(
      sessionReconciliations,
      eq(sessionReconciliations.sessionId, sessions.id)
    )
    .leftJoin(
      documentSnapshots,
      eq(documentSnapshots.documentId, sessionDocuments.id)
    )
    .where(whereClause)

  return {
    scope,
    ...summary,
    parseCoverageRatio:
      summary.totalSessions > 0
        ? summary.parsedSessions / summary.totalSessions
        : 0,
    reconciliationCoverageRatio:
      summary.totalSessions > 0
        ? summary.reconciledSessions / summary.totalSessions
        : 0,
    matchRatio:
      summary.reconciledSessions > 0
        ? summary.matchedSessions / summary.reconciledSessions
        : 0,
  }
}

export async function listSessionQuality(scope: AnalyticsScope = {}) {
  const clauses = []
  if (scope.periodId) clauses.push(eq(sessions.periodId, scope.periodId))
  if (scope.legislature)
    clauses.push(eq(legislativePeriods.legislature, scope.legislature))
  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const rows = await db
    .select({
      sessionId: sessions.id,
      sessionDate: sessions.sessionDate,
      title: sessions.title,
      sessionType: sessions.sessionType,
      legislature: legislativePeriods.legislature,
      periodId: sessions.periodId,
      periodLabel: legislativePeriods.label,
      attendanceDocumentId: sql<
        string | null
      >`max(case when ${sessionDocuments.kind} = 'attendance' then ${sessionDocuments.id}::text else null end)`,
      absenceDocumentId: sql<
        string | null
      >`max(case when ${sessionDocuments.kind} = 'absence' then ${sessionDocuments.id}::text else null end)`,
      lastCheckedAt: sql<Date | null>`max(${sessionDocuments.lastCheckedAt})`,
      lastChangedAt: sql<Date | null>`max(${sessionDocuments.lastChangedAt})`,
      latestSnapshotStatus: sql<
        string | null
      >`max(${documentSnapshots.status})`,
      parseRunCount: sql<number>`count(distinct ${documentParseRuns.id})::int`,
      attendanceRecordCount: sql<number>`count(distinct ${attendanceRecords.id})::int`,
      reconciled: sql<string | null>`max(${sessionReconciliations.matches})`,
      missingFromAttendanceCount: sql<number>`coalesce(max(${sessionReconciliations.missingFromAttendanceCount}), 0)::int`,
      extraInAttendanceCount: sql<number>`coalesce(max(${sessionReconciliations.extraInAttendanceCount}), 0)::int`,
      groupDiffCount: sql<number>`coalesce(max(${sessionReconciliations.groupDiffCount}), 0)::int`,
      reconciledAt: sql<Date | null>`max(${sessionReconciliations.reconciledAt})`,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .leftJoin(sessionDocuments, eq(sessionDocuments.sessionId, sessions.id))
    .leftJoin(
      documentSnapshots,
      eq(documentSnapshots.documentId, sessionDocuments.id)
    )
    .leftJoin(
      documentParseRuns,
      eq(documentParseRuns.documentId, sessionDocuments.id)
    )
    .leftJoin(attendanceRecords, eq(attendanceRecords.sessionId, sessions.id))
    .leftJoin(
      sessionReconciliations,
      eq(sessionReconciliations.sessionId, sessions.id)
    )
    .where(whereClause)
    .groupBy(
      sessions.id,
      sessions.sessionDate,
      sessions.title,
      sessions.sessionType,
      legislativePeriods.legislature,
      sessions.periodId,
      legislativePeriods.label
    )
    .orderBy(desc(sessions.sessionDate), asc(sessions.title))

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
  }))
}

type IngestAnomalyScope = {
  legislature?: string
  kind?: string
  limit?: number
}

export async function listIngestAnomalies(scope: IngestAnomalyScope = {}) {
  const clauses = []
  if (scope.legislature) {
    clauses.push(eq(legislativePeriods.legislature, scope.legislature))
  }
  if (scope.kind) {
    clauses.push(eq(ingestAnomalies.kind, scope.kind))
  }
  const whereClause =
    clauses.length === 0
      ? undefined
      : clauses.length === 1
        ? clauses[0]
        : and(...clauses)

  const limit = Math.min(scope.limit ?? 200, 500)

  const rows = await db
    .select({
      id: ingestAnomalies.id,
      sessionId: ingestAnomalies.sessionId,
      documentId: ingestAnomalies.documentId,
      parseRunId: ingestAnomalies.parseRunId,
      kind: ingestAnomalies.kind,
      message: ingestAnomalies.message,
      snippet: ingestAnomalies.snippet,
      sourceUrl: ingestAnomalies.sourceUrl,
      metadata: ingestAnomalies.metadata,
      createdAt: ingestAnomalies.createdAt,
      sessionDate: sessions.sessionDate,
      sessionTitle: sessions.title,
      legislature: legislativePeriods.legislature,
    })
    .from(ingestAnomalies)
    .innerJoin(sessions, eq(ingestAnomalies.sessionId, sessions.id))
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(whereClause)
    .orderBy(desc(ingestAnomalies.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    sessionDate: row.sessionDate ? row.sessionDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function getAdminSessionInspection(sessionId: string) {
  const [sessionRow] = await db
    .select({
      session: sessions,
      period: legislativePeriods,
    })
    .from(sessions)
    .leftJoin(legislativePeriods, eq(sessions.periodId, legislativePeriods.id))
    .where(eq(sessions.id, sessionId))
    .limit(1)

  if (!sessionRow) {
    throw new Error("Session not found.")
  }

  const documents = await db
    .select()
    .from(sessionDocuments)
    .where(eq(sessionDocuments.sessionId, sessionId))

  const snapshotRows = await db
    .select({
      snapshot: documentSnapshots,
      documentKind: sessionDocuments.kind,
    })
    .from(documentSnapshots)
    .innerJoin(
      sessionDocuments,
      eq(documentSnapshots.documentId, sessionDocuments.id)
    )
    .where(eq(sessionDocuments.sessionId, sessionId))
    .orderBy(desc(documentSnapshots.fetchedAt))

  const parseRunRows = await db
    .select({
      parseRun: documentParseRuns,
      documentKind: sessionDocuments.kind,
    })
    .from(documentParseRuns)
    .innerJoin(
      sessionDocuments,
      eq(documentParseRuns.documentId, sessionDocuments.id)
    )
    .where(eq(sessionDocuments.sessionId, sessionId))
    .orderBy(desc(documentParseRuns.startedAt))

  const [reconciliation] = await db
    .select()
    .from(sessionReconciliations)
    .where(eq(sessionReconciliations.sessionId, sessionId))
    .limit(1)

  const attendanceRows = await db
    .select({
      id: attendanceRecords.id,
      rowNumber: attendanceRecords.rowNumber,
      pageNumber: attendanceRecords.pageNumber,
      rawName: attendanceRecords.rawName,
      normalizedName: attendanceRecords.normalizedName,
      status: attendanceRecords.status,
      rawStatus: attendanceRecords.rawStatus,
      groupCode: parliamentaryGroups.code,
      groupName: parliamentaryGroups.name,
    })
    .from(attendanceRecords)
    .leftJoin(
      parliamentaryGroups,
      eq(attendanceRecords.groupId, parliamentaryGroups.id)
    )
    .where(eq(attendanceRecords.sessionId, sessionId))
    .orderBy(asc(attendanceRecords.rowNumber))
    .limit(600)

  const anomalies = await db
    .select()
    .from(ingestAnomalies)
    .where(eq(ingestAnomalies.sessionId, sessionId))
    .orderBy(desc(ingestAnomalies.createdAt))
    .limit(200)

  const attendanceDoc = documents.find((doc) => doc.kind === "attendance")

  return {
    session: {
      ...sessionRow.session,
      sessionDate: sessionRow.session.sessionDate
        ? sessionRow.session.sessionDate.toISOString()
        : null,
    },
    period: sessionRow.period,
    documents,
    snapshots: snapshotRows.map((row) => ({
      ...row.snapshot,
      documentKind: row.documentKind,
      fetchedAt: row.snapshot.fetchedAt.toISOString(),
    })),
    parseRuns: parseRunRows.map((row) => ({
      ...row.parseRun,
      documentKind: row.documentKind,
      startedAt: row.parseRun.startedAt.toISOString(),
      finishedAt: row.parseRun.finishedAt
        ? row.parseRun.finishedAt.toISOString()
        : null,
    })),
    reconciliation: reconciliation
      ? {
          ...reconciliation,
          reconciledAt: reconciliation.reconciledAt.toISOString(),
          details: reconciliation.details as
            | {
                missingFromAttendance?: string[]
                extraInAttendance?: string[]
                groupDiffs?: Array<{
                  groupCode: string
                  attendanceCount: number
                  absenceCount: number
                  difference: number
                }>
              }
            | undefined,
        }
      : null,
    attendancePreview: attendanceRows,
    anomalies: anomalies.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    rawTextPreview:
      attendanceDoc?.rawText && attendanceDoc.rawText.length > 0
        ? attendanceDoc.rawText.slice(0, 8000)
        : null,
  }
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
])

function isValidGroupCode(code: string): boolean {
  // Si está en la lista blanca, es válido
  if (VALID_GROUP_CODES.has(code.toUpperCase())) return true

  // Si tiene más de 10 caracteres, probablemente es un nombre de persona
  if (code.length > 10) return false

  // Si contiene números, probablemente es inválido (ej: "194 RENDON...")
  if (/\d/.test(code)) return false

  // Si tiene más de 2 palabras, probablemente es un nombre
  if (code.trim().split(/\s+/).length > 2) return false

  return true
}

export async function cleanupInvalidGroups(legislature?: string) {
  // Buscar grupos inválidos
  const invalidGroups = await db
    .select({
      id: parliamentaryGroups.id,
      code: parliamentaryGroups.code,
      name: parliamentaryGroups.name,
      legislature: parliamentaryGroups.legislature,
    })
    .from(parliamentaryGroups)
    .where(
      legislature ? eq(parliamentaryGroups.legislature, legislature) : undefined
    )
    .then((rows) => rows.filter((row) => !isValidGroupCode(row.code)))

  if (invalidGroups.length === 0) {
    return { deleted: 0, groups: [] }
  }

  const invalidIds = invalidGroups.map((g) => g.id)

  // Eliminar registros relacionados primero
  await db
    .delete(sessionGroupSummaries)
    .where(inArray(sessionGroupSummaries.groupId, invalidIds))

  await db
    .delete(attendanceRecords)
    .where(inArray(attendanceRecords.groupId, invalidIds))

  // Actualizar legisladores para remover referencia a grupos inválidos
  await db
    .update(legislators)
    .set({ currentGroupId: null })
    .where(inArray(legislators.currentGroupId, invalidIds))

  // Eliminar los grupos inválidos
  await db
    .delete(parliamentaryGroups)
    .where(inArray(parliamentaryGroups.id, invalidIds))

  return {
    deleted: invalidGroups.length,
    groups: invalidGroups.map((g) => ({
      code: g.code,
      name: g.name,
      legislature: g.legislature,
    })),
  }
}
