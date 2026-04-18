import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const sessionTypeEnum = pgEnum("session_type", [
  "ordinary",
  "permanent",
  "special",
  "vote",
  "unknown",
])

export const documentKindEnum = pgEnum("document_kind", [
  "attendance",
  "absence",
  "attendance_summary",
  "absence_summary",
])

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "attendance",
  "cedula",
  "justified_absence",
  "absence",
  "official_commission",
  "board_leave",
  "not_present_in_votes",
  "unknown",
])

export const parseRunStatusEnum = pgEnum("parse_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
])

export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "fetched",
  "unchanged",
  "changed",
  "failed",
])

export const jobTypeEnum = pgEnum("job_type", [
  "process_period",
  "process_all_periods",
])

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
])

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  sourceUrl: text("source_url").notNull(),
  summary: jsonb("summary"),
})

export const jobQueue = pgTable(
  "job_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(100),
    dedupeKey: text("dedupe_key"),
    payload: jsonb("payload").notNull(),
    progress: jsonb("progress"),
    result: jsonb("result"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    createdByEmail: text("created_by_email"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusRunAtIdx: index("job_queue_status_run_at_idx").on(
      table.status,
      table.runAt
    ),
    dedupeKeyUnique: uniqueIndex("job_queue_dedupe_key_uidx").on(
      table.dedupeKey
    ),
  })
)

export const legislativePeriods = pgTable(
  "legislative_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    legislature: text("legislature").notNull(),
    yearSpan: text("year_span").notNull(),
    periodPageUrl: text("period_page_url").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    periodPageUrlUnique: uniqueIndex(
      "legislative_periods_period_page_url_uidx"
    ).on(table.periodPageUrl),
  })
)

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodId: uuid("period_id").references(() => legislativePeriods.id, {
      onDelete: "set null",
    }),
    gacetaNumber: integer("gaceta_number"),
    sessionDate: timestamp("session_date", { withTimezone: true }),
    title: text("title").notNull(),
    sessionType: sessionTypeEnum("session_type").notNull().default("unknown"),
    sessionPageUrl: text("session_page_url").notNull(),
    sourceSlug: text("source_slug").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionPageUrlUnique: uniqueIndex("sessions_session_page_url_uidx").on(
      table.sessionPageUrl
    ),
    sessionDateIdx: index("sessions_session_date_idx").on(table.sessionDate),
  })
)

export const sessionDocuments = pgTable(
  "session_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    kind: documentKindEnum("kind").notNull(),
    url: text("url").notNull(),
    pageCount: integer("page_count"),
    rawText: text("raw_text"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionMeta: jsonb("extraction_meta"),
    latestContentHash: text("latest_content_hash"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionKindUnique: uniqueIndex("session_documents_session_kind_uidx").on(
      table.sessionId,
      table.kind
    ),
  })
)

export const documentSnapshots = pgTable(
  "document_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => sessionDocuments.id, {
        onDelete: "cascade",
      }),
    previousSnapshotId: uuid("previous_snapshot_id"),
    sourceUrl: text("source_url").notNull(),
    status: snapshotStatusEnum("status").notNull().default("fetched"),
    contentHash: text("content_hash"),
    byteSize: integer("byte_size"),
    etag: text("etag"),
    lastModified: text("last_modified"),
    contentType: text("content_type"),
    httpStatus: integer("http_status"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    changedAt: timestamp("changed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    documentFetchedAtIdx: index(
      "document_snapshots_document_fetched_at_idx"
    ).on(table.documentId, table.fetchedAt),
  })
)

export const parliamentaryGroups = pgTable(
  "parliamentary_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legislature: text("legislature").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    legislatureCodeUnique: uniqueIndex(
      "parliamentary_groups_legislature_code_uidx"
    ).on(table.legislature, table.code),
  })
)

export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: text("full_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("people_normalized_name_uidx").on(
      table.normalizedName
    ),
  })
)

export const legislators = pgTable(
  "legislators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    legislature: text("legislature").notNull(),
    fullName: text("full_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    displayOrderHint: integer("display_order_hint"),
    currentGroupId: uuid("current_group_id").references(
      () => parliamentaryGroups.id,
      {
        onDelete: "set null",
      }
    ),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    personIdx: index("legislators_person_id_idx").on(table.personId),
    legislatureNormalizedNameUnique: uniqueIndex(
      "legislators_legislature_normalized_name_uidx"
    ).on(table.legislature, table.normalizedName),
  })
)

export const documentParseRuns = pgTable(
  "document_parse_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => sessionDocuments.id, {
        onDelete: "cascade",
      }),
    parserVersion: text("parser_version").notNull(),
    status: parseRunStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metrics: jsonb("metrics"),
  },
  (table) => ({
    documentStartedAtIdx: index(
      "document_parse_runs_document_started_at_idx"
    ).on(table.documentId, table.startedAt),
  })
)

export const sessionGroupSummaries = pgTable(
  "session_group_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => parliamentaryGroups.id, {
        onDelete: "cascade",
      }),
    sourceDocumentId: uuid("source_document_id").references(
      () => sessionDocuments.id,
      {
        onDelete: "set null",
      }
    ),
    attendanceCount: integer("attendance_count").notNull().default(0),
    cedulaCount: integer("cedula_count").notNull().default(0),
    justifiedAbsenceCount: integer("justified_absence_count")
      .notNull()
      .default(0),
    absenceCount: integer("absence_count").notNull().default(0),
    officialCommissionCount: integer("official_commission_count")
      .notNull()
      .default(0),
    boardLeaveCount: integer("board_leave_count").notNull().default(0),
    notPresentInVotesCount: integer("not_present_in_votes_count")
      .notNull()
      .default(0),
    totalCount: integer("total_count").notNull().default(0),
    rawLabel: text("raw_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionGroupUnique: uniqueIndex(
      "session_group_summaries_session_group_uidx"
    ).on(table.sessionId, table.groupId),
  })
)

export const sessionReconciliations = pgTable(
  "session_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    attendanceDocumentId: uuid("attendance_document_id").references(
      () => sessionDocuments.id,
      {
        onDelete: "set null",
      }
    ),
    absenceDocumentId: uuid("absence_document_id").references(
      () => sessionDocuments.id,
      {
        onDelete: "set null",
      }
    ),
    attendanceSnapshotHash: text("attendance_snapshot_hash"),
    absenceSnapshotHash: text("absence_snapshot_hash"),
    matches: text("matches").notNull().default("unknown"),
    attendanceAbsenceCount: integer("attendance_absence_count")
      .notNull()
      .default(0),
    absencePdfCount: integer("absence_pdf_count").notNull().default(0),
    missingFromAttendanceCount: integer("missing_from_attendance_count")
      .notNull()
      .default(0),
    extraInAttendanceCount: integer("extra_in_attendance_count")
      .notNull()
      .default(0),
    groupDiffCount: integer("group_diff_count").notNull().default(0),
    details: jsonb("details"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionUnique: uniqueIndex("session_reconciliations_session_uidx").on(
      table.sessionId
    ),
  })
)

export const ingestAnomalies = pgTable(
  "ingest_anomalies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    documentId: uuid("document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    parseRunId: uuid("parse_run_id").references(() => documentParseRuns.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    snippet: text("snippet"),
    sourceUrl: text("source_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionCreatedIdx: index("ingest_anomalies_session_created_idx").on(
      table.sessionId,
      table.createdAt
    ),
    kindIdx: index("ingest_anomalies_kind_idx").on(table.kind),
  })
)

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    legislatorId: uuid("legislator_id").references(() => legislators.id, {
      onDelete: "set null",
    }),
    groupId: uuid("group_id").references(() => parliamentaryGroups.id, {
      onDelete: "set null",
    }),
    sourceDocumentId: uuid("source_document_id").references(
      () => sessionDocuments.id,
      {
        onDelete: "set null",
      }
    ),
    sourceParseRunId: uuid("source_parse_run_id").references(
      () => documentParseRuns.id,
      {
        onDelete: "set null",
      }
    ),
    rowNumber: integer("row_number"),
    pageNumber: integer("page_number"),
    rawName: text("raw_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    status: attendanceStatusEnum("status").notNull().default("unknown"),
    rawStatus: text("raw_status"),
    confidence: integer("confidence"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionNormalizedNameUnique: uniqueIndex(
      "attendance_records_session_normalized_name_uidx"
    ).on(table.sessionId, table.normalizedName),
    sessionStatusIdx: index("attendance_records_session_status_idx").on(
      table.sessionId,
      table.status
    ),
  })
)
