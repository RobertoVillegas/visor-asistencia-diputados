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
} from "drizzle-orm/pg-core";

export const sessionTypeEnum = pgEnum("session_type", [
  "ordinary",
  "permanent",
  "special",
  "vote",
  "unknown",
]);

export const documentKindEnum = pgEnum("document_kind", [
  "attendance",
  "absence",
  "attendance_summary",
  "absence_summary",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "attendance",
  "cedula",
  "justified_absence",
  "absence",
  "official_commission",
  "board_leave",
  "not_present_in_votes",
  "unknown",
]);

export const parseRunStatusEnum = pgEnum("parse_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "fetched",
  "unchanged",
  "changed",
  "failed",
]);

export const jobTypeEnum = pgEnum("job_type", ["process_period", "process_all_periods"]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const crawlRuns = pgTable("crawl_runs", {
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  id: uuid("id").defaultRandom().primaryKey(),
  sourceUrl: text("source_url").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("running"),
  summary: jsonb("summary"),
});

export const jobQueue = pgTable(
  "job_queue",
  {
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByEmail: text("created_by_email"),
    dedupeKey: text("dedupe_key"),
    errorMessage: text("error_message"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: uuid("id").defaultRandom().primaryKey(),
    maxAttempts: integer("max_attempts").notNull().default(3),
    payload: jsonb("payload").notNull(),
    priority: integer("priority").notNull().default(100),
    progress: jsonb("progress"),
    result: jsonb("result"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: jobStatusEnum("status").notNull().default("pending"),
    type: jobTypeEnum("type").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dedupeKeyUnique: uniqueIndex("job_queue_dedupe_key_uidx").on(table.dedupeKey),
    statusRunAtIdx: index("job_queue_status_run_at_idx").on(table.status, table.runAt),
  }),
);

export const legislativePeriods = pgTable(
  "legislative_periods",
  {
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    legislature: text("legislature").notNull(),
    periodPageUrl: text("period_page_url").notNull(),
    yearSpan: text("year_span").notNull(),
  },
  (table) => ({
    periodPageUrlUnique: uniqueIndex("legislative_periods_period_page_url_uidx").on(
      table.periodPageUrl,
    ),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    gacetaNumber: integer("gaceta_number"),
    id: uuid("id").defaultRandom().primaryKey(),
    metadata: jsonb("metadata"),
    periodId: uuid("period_id").references(() => legislativePeriods.id, {
      onDelete: "set null",
    }),
    sessionDate: timestamp("session_date", { withTimezone: true }),
    sessionPageUrl: text("session_page_url").notNull(),
    sessionType: sessionTypeEnum("session_type").notNull().default("unknown"),
    sourceSlug: text("source_slug").notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionDateIdx: index("sessions_session_date_idx").on(table.sessionDate),
    sessionPageUrlUnique: uniqueIndex("sessions_session_page_url_uidx").on(table.sessionPageUrl),
  }),
);

export const sessionDocuments = pgTable(
  "session_documents",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionMeta: jsonb("extraction_meta"),
    id: uuid("id").defaultRandom().primaryKey(),
    kind: documentKindEnum("kind").notNull(),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    latestContentHash: text("latest_content_hash"),
    pageCount: integer("page_count"),
    rawText: text("raw_text"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    url: text("url").notNull(),
  },
  (table) => ({
    sessionKindUnique: uniqueIndex("session_documents_session_kind_uidx").on(
      table.sessionId,
      table.kind,
    ),
  }),
);

export const documentSnapshots = pgTable(
  "document_snapshots",
  {
    byteSize: integer("byte_size"),
    changedAt: timestamp("changed_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    contentType: text("content_type"),
    documentId: uuid("document_id")
      .notNull()
      .references(() => sessionDocuments.id, {
        onDelete: "cascade",
      }),
    etag: text("etag"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    httpStatus: integer("http_status"),
    id: uuid("id").defaultRandom().primaryKey(),
    lastModified: text("last_modified"),
    metadata: jsonb("metadata"),
    previousSnapshotId: uuid("previous_snapshot_id"),
    sourceUrl: text("source_url").notNull(),
    status: snapshotStatusEnum("status").notNull().default("fetched"),
  },
  (table) => ({
    documentFetchedAtIdx: index("document_snapshots_document_fetched_at_idx").on(
      table.documentId,
      table.fetchedAt,
    ),
  }),
);

export const parliamentaryGroups = pgTable(
  "parliamentary_groups",
  {
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    id: uuid("id").defaultRandom().primaryKey(),
    legislature: text("legislature").notNull(),
    name: text("name").notNull(),
  },
  (table) => ({
    legislatureCodeUnique: uniqueIndex("parliamentary_groups_legislature_code_uidx").on(
      table.legislature,
      table.code,
    ),
  }),
);

export const people = pgTable(
  "people",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    fullName: text("full_name").notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    metadata: jsonb("metadata"),
    normalizedName: text("normalized_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("people_normalized_name_uidx").on(table.normalizedName),
  }),
);

export const legislators = pgTable(
  "legislators",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    currentGroupId: uuid("current_group_id").references(() => parliamentaryGroups.id, {
      onDelete: "set null",
    }),
    displayOrderHint: integer("display_order_hint"),
    fullName: text("full_name").notNull(),
    id: uuid("id").defaultRandom().primaryKey(),
    legislature: text("legislature").notNull(),
    metadata: jsonb("metadata"),
    normalizedName: text("normalized_name").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, {
        onDelete: "cascade",
      }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    legislatureNormalizedNameUnique: uniqueIndex("legislators_legislature_normalized_name_uidx").on(
      table.legislature,
      table.normalizedName,
    ),
    personIdx: index("legislators_person_id_idx").on(table.personId),
  }),
);

export const documentParseRuns = pgTable(
  "document_parse_runs",
  {
    documentId: uuid("document_id")
      .notNull()
      .references(() => sessionDocuments.id, {
        onDelete: "cascade",
      }),
    errorMessage: text("error_message"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: uuid("id").defaultRandom().primaryKey(),
    metrics: jsonb("metrics"),
    parserVersion: text("parser_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    status: parseRunStatusEnum("status").notNull().default("pending"),
  },
  (table) => ({
    documentStartedAtIdx: index("document_parse_runs_document_started_at_idx").on(
      table.documentId,
      table.startedAt,
    ),
  }),
);

export const sessionGroupSummaries = pgTable(
  "session_group_summaries",
  {
    absenceCount: integer("absence_count").notNull().default(0),
    attendanceCount: integer("attendance_count").notNull().default(0),
    boardLeaveCount: integer("board_leave_count").notNull().default(0),
    cedulaCount: integer("cedula_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => parliamentaryGroups.id, {
        onDelete: "cascade",
      }),
    id: uuid("id").defaultRandom().primaryKey(),
    justifiedAbsenceCount: integer("justified_absence_count").notNull().default(0),
    notPresentInVotesCount: integer("not_present_in_votes_count").notNull().default(0),
    officialCommissionCount: integer("official_commission_count").notNull().default(0),
    rawLabel: text("raw_label"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    sourceDocumentId: uuid("source_document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    totalCount: integer("total_count").notNull().default(0),
  },
  (table) => ({
    sessionGroupUnique: uniqueIndex("session_group_summaries_session_group_uidx").on(
      table.sessionId,
      table.groupId,
    ),
  }),
);

export const sessionReconciliations = pgTable(
  "session_reconciliations",
  {
    absenceDocumentId: uuid("absence_document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    absencePdfCount: integer("absence_pdf_count").notNull().default(0),
    absenceSnapshotHash: text("absence_snapshot_hash"),
    attendanceAbsenceCount: integer("attendance_absence_count").notNull().default(0),
    attendanceDocumentId: uuid("attendance_document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    attendanceSnapshotHash: text("attendance_snapshot_hash"),
    details: jsonb("details"),
    extraInAttendanceCount: integer("extra_in_attendance_count").notNull().default(0),
    groupDiffCount: integer("group_diff_count").notNull().default(0),
    id: uuid("id").defaultRandom().primaryKey(),
    matches: text("matches").notNull().default("unknown"),
    missingFromAttendanceCount: integer("missing_from_attendance_count").notNull().default(0),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
  },
  (table) => ({
    sessionUnique: uniqueIndex("session_reconciliations_session_uidx").on(table.sessionId),
  }),
);

export const ingestAnomalies = pgTable(
  "ingest_anomalies",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    documentId: uuid("document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    parseRunId: uuid("parse_run_id").references(() => documentParseRuns.id, {
      onDelete: "set null",
    }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    snippet: text("snippet"),
    sourceUrl: text("source_url"),
  },
  (table) => ({
    kindIdx: index("ingest_anomalies_kind_idx").on(table.kind),
    sessionCreatedIdx: index("ingest_anomalies_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    confidence: integer("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    groupId: uuid("group_id").references(() => parliamentaryGroups.id, {
      onDelete: "set null",
    }),
    id: uuid("id").defaultRandom().primaryKey(),
    legislatorId: uuid("legislator_id").references(() => legislators.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata"),
    normalizedName: text("normalized_name").notNull(),
    pageNumber: integer("page_number"),
    rawName: text("raw_name").notNull(),
    rawStatus: text("raw_status"),
    rowNumber: integer("row_number"),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, {
        onDelete: "cascade",
      }),
    sourceDocumentId: uuid("source_document_id").references(() => sessionDocuments.id, {
      onDelete: "set null",
    }),
    sourceParseRunId: uuid("source_parse_run_id").references(() => documentParseRuns.id, {
      onDelete: "set null",
    }),
    status: attendanceStatusEnum("status").notNull().default("unknown"),
  },
  (table) => ({
    sessionNormalizedNameUnique: uniqueIndex("attendance_records_session_normalized_name_uidx").on(
      table.sessionId,
      table.normalizedName,
    ),
    sessionStatusIdx: index("attendance_records_session_status_idx").on(
      table.sessionId,
      table.status,
    ),
  }),
);
