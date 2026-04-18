function getConfiguredApiBaseUrl() {
  if (typeof process !== "undefined" && process.env.VITE_API_BASE_URL?.trim()) {
    return process.env.VITE_API_BASE_URL.trim();
  }

  return import.meta.env.VITE_API_BASE_URL?.trim();
}

const configuredApiBaseUrl = getConfiguredApiBaseUrl();

function resolveApiBaseUrl() {
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }

  throw new Error("VITE_API_BASE_URL is required in production builds");
}

const API_BASE_URL = resolveApiBaseUrl();

export interface StoredPeriod {
  id: string;
  label: string;
  legislature: string;
  yearSpan: string;
  periodPageUrl: string;
  discoveredAt: string;
}

export interface RemotePeriod {
  label: string;
  legislature: string;
  yearSpan: string;
  periodPageUrl: string;
}

export interface LatestPeriodResponse {
  latest: RemotePeriod | null;
  stored: StoredPeriod | null;
}

export interface AnalyticsOverview {
  scope: {
    legislature?: string;
    periodId?: string;
  };
  totalSessions: number;
  parsedSessions: number;
  legislatorsCount: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
  totalMentions: number;
  attendanceRatio: number;
  absenceRatio: number;
  justifiedAbsenceRatio: number;
}

export interface PartyAnalyticsRow {
  groupCode: string;
  groupName: string;
  legislature: string;
  sessionCount: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
  totalCount: number;
  attendanceRatio: number;
  absenceRatio: number;
  justifiedAbsenceRatio: number;
}

export interface PartyTrendSeries {
  key: string;
  label: string;
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

export interface PartyTrendsResponse {
  scope: {
    legislature?: string;
    periodId?: string;
  };
  series: PartyTrendSeries[];
}

export interface LegislatorAnalyticsRow {
  id: string;
  personId: string;
  fullName: string;
  legislature: string;
  groupCode: string | null;
  groupName: string | null;
  imageUrl: string | null;
  bio: string | null;
  sessionsMentioned: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
  attendanceRatio: number;
  absenceRatio: number;
}

export interface QualityOverview {
  scope: {
    legislature?: string;
    periodId?: string;
  };
  totalSessions: number;
  sessionsWithAttendanceDoc: number;
  sessionsWithAbsenceDoc: number;
  parsedSessions: number;
  reconciledSessions: number;
  matchedSessions: number;
  mismatchedSessions: number;
  changedDocuments: number;
  failedSnapshots: number;
  parseCoverageRatio: number;
  reconciliationCoverageRatio: number;
  matchRatio: number;
}

export interface SessionQualityRow {
  sessionId: string;
  sessionDate: string | null;
  title: string;
  sessionType: string;
  legislature: string | null;
  periodId: string | null;
  periodLabel: string | null;
  attendanceDocumentId: string | null;
  absenceDocumentId: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  latestSnapshotStatus: "fetched" | "unchanged" | "changed" | "failed" | null;
  parseRunCount: number;
  attendanceRecordCount: number;
  reconciled: "true" | "false" | null;
  missingFromAttendanceCount: number;
  extraInAttendanceCount: number;
  groupDiffCount: number;
  reconciledAt: string | null;
  parseStatus: "parsed" | "discovered" | "missing_attendance_document";
  reconciliationStatus: "matched" | "mismatched" | "not_reconciled" | "missing_absence_document";
}

export interface LegislatorSummary {
  id: string;
  personId: string;
  fullName: string;
  legislature: string;
  groupCode: string | null;
  groupName: string | null;
  imageUrl: string | null;
  bio: string | null;
  sessionsMentioned: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
  relatedLegislatures: {
    id: string;
    legislature: string;
    groupCode: string | null;
    groupName: string | null;
    isCurrent: boolean;
  }[];
}

export interface LegislatorAttendanceRow {
  attendanceRecordId: string;
  status: string;
  rawStatus: string | null;
  sessionId: string;
  sessionDate: string | null;
  sessionType: string;
  title: string;
  sessionPageUrl: string;
  groupCode: string | null;
  groupName: string | null;
}

export interface LegislatorTrend {
  legislator: {
    id: string;
    fullName: string;
    groupCode: string | null;
    groupName: string | null;
    legislature: string;
  };
  points: {
    sessionDate: string | null;
    sessionId: string;
    sessionType: string;
    title: string;
    status: string;
    value: 0 | 1;
  }[];
}

export interface ApiSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  session: {
    id: string;
  } | null;
}

export interface ProcessPeriodResult {
  period: StoredPeriod;
  discoveredSessionCount?: number;
  processedSessionCount?: number;
  parsedSessions?: number;
  reconciledSessions?: number;
  failedSessions?: number;
  results?: unknown[];
}

export interface ProcessAllPeriodsResult {
  legislature: string | null;
  totalPeriods: number;
  processedPeriods: number;
  failedPeriods: number;
  results?: unknown[];
}

export interface JobQueueItem {
  id: string;
  type: "process_period" | "process_all_periods";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  priority: number;
  dedupeKey: string | null;
  payload: Record<string, unknown>;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  createdByEmail: string | null;
  runAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobQueueResponse {
  stats: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  jobs: JobQueueItem[];
}

export interface IngestAnomalyRow {
  id: string;
  sessionId: string;
  documentId: string | null;
  parseRunId: string | null;
  kind: string;
  message: string;
  snippet: string | null;
  sourceUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  sessionDate: string | null;
  sessionTitle: string | null;
  legislature: string | null;
}

export interface ReconciliationDetails {
  missingFromAttendance?: string[];
  extraInAttendance?: string[];
  groupDiffs?: {
    groupCode: string;
    attendanceCount: number;
    absenceCount: number;
    difference: number;
  }[];
}

export interface SessionInspectionResponse {
  session: Record<string, unknown> & {
    id: string;
    title: string;
    sessionDate: string | null;
    sessionPageUrl: string;
    sourceSlug: string;
  };
  period: Record<string, unknown> | null;
  documents: Record<string, unknown>[];
  snapshots: Record<string, unknown>[];
  parseRuns: Record<string, unknown>[];
  reconciliation:
    | (Record<string, unknown> & {
        details?: ReconciliationDetails;
      })
    | null;
  attendancePreview: Record<string, unknown>[];
  anomalies: (Record<string, unknown> & { createdAt: string })[];
  rawTextPreview: string | null;
}

export interface PeopleDirectoryResponse {
  page: number;
  pageSize: number;
  total: number;
  items: {
    id: string;
    legislatorId: string;
    fullName: string;
    normalizedName: string;
    legislature: string;
    groupCode: string | null;
    groupName: string | null;
    imageUrl: string | null;
    bio: string | null;
  }[];
}

interface Scope {
  legislature?: string;
  periodId?: string;
  includePermanent?: boolean;
}

type LegislatorQuery = Scope & {
  q?: string;
  sort?:
    | "name"
    | "attendance_ratio"
    | "participation_ratio"
    | "attendance_count"
    | "absence_count"
    | "justified_absence_count"
    | "sessions_mentioned";
  order?: "asc" | "desc";
};

function buildUrl(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(path, API_BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string | undefined>,
) {
  const response = await fetch(buildUrl(path, params), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const error = (await response.json()) as { error?: string };
      if (error.error) {
        message = error.error;
      }
    } catch {
      // Ignore JSON parse failures.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

function scopeToParams(scope: Scope): Record<string, string | undefined> {
  return {
    includePermanent:
      scope.includePermanent === undefined ? undefined : String(scope.includePermanent),
    legislature: scope.legislature,
    periodId: scope.periodId,
  };
}

function legislatorQueryToParams(query: LegislatorQuery): Record<string, string | undefined> {
  return {
    ...scopeToParams(query),
    order: query.order,
    q: query.q,
    sort: query.sort,
  };
}

export const api = {
  baseUrl: API_BASE_URL,
  cleanupInvalidGroups: (body: { legislature?: string }) =>
    fetchJson<{
      deleted: number;
      groups: { code: string; name: string; legislature: string }[];
    }>("/api/admin/cleanup-invalid-groups", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  enqueueProcessAllPeriodsJob: (body: { legislature?: string; forceParseAll?: boolean }) =>
    fetchJson<JobQueueItem>("/api/admin/jobs/process-all-periods", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  enqueueProcessPeriodJob: (body: {
    periodId?: string;
    periodPageUrl?: string;
    forceParseAll?: boolean;
  }) =>
    fetchJson<JobQueueItem>("/api/admin/jobs/process-period", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  getLatestPeriod: () => fetchJson<LatestPeriodResponse>("/api/periods/latest"),
  getLegislator: (id: string) => fetchJson<LegislatorSummary>(`/api/legislators/${id}`),
  getLegislatorAttendance: (id: string) =>
    fetchJson<LegislatorAttendanceRow[]>(`/api/legislators/${id}/attendance`),
  getLegislatorTrend: (id: string, scope: Scope) =>
    fetchJson<LegislatorTrend>(
      `/api/analytics/trends/legislator/${id}`,
      undefined,
      scopeToParams(scope),
    ),
  getOverview: (scope: Scope) =>
    fetchJson<AnalyticsOverview>("/api/analytics/overview", undefined, scopeToParams(scope)),
  getParties: (scope: Scope) =>
    fetchJson<PartyAnalyticsRow[]>("/api/analytics/parties", undefined, {
      ...scopeToParams(scope),
      order: "desc",
    }),
  getPartyTrends: (scope: Scope) =>
    fetchJson<PartyTrendsResponse>(
      "/api/analytics/trends/parties",
      undefined,
      scopeToParams(scope),
    ),
  getPerson: (id: string, scope?: { legislature?: string; periodId?: string }) =>
    fetchJson<LegislatorSummary>(`/api/people/${id}`, undefined, {
      legislature: scope?.legislature,
      periodId: scope?.periodId,
    }),
  getPersonAttendance: (id: string, scope?: { legislature?: string; periodId?: string }) =>
    fetchJson<LegislatorAttendanceRow[]>(`/api/people/${id}/attendance`, undefined, {
      legislature: scope?.legislature,
      periodId: scope?.periodId,
    }),
  getPersonTrend: (id: string, scope: Scope) =>
    fetchJson<LegislatorTrend>(
      `/api/analytics/trends/person/${id}`,
      undefined,
      scopeToParams(scope),
    ),
  getQuality: (scope: Scope) =>
    fetchJson<QualityOverview>("/api/analytics/quality", undefined, scopeToParams(scope)),
  getSession: () => fetchJson<ApiSession>("/api/session"),
  getSessionInspection: (sessionId: string) =>
    fetchJson<SessionInspectionResponse>(`/api/admin/sessions/${sessionId}/inspection`),
  listIngestAnomalies: (query?: { legislature?: string; kind?: string; limit?: number }) =>
    fetchJson<IngestAnomalyRow[]>("/api/admin/anomalies", undefined, {
      kind: query?.kind,
      legislature: query?.legislature,
      limit: query?.limit ? String(query.limit) : undefined,
    }),
  listJobs: (query?: {
    status?: "pending" | "running" | "completed" | "failed" | "cancelled";
    type?: "process_period" | "process_all_periods";
  }) => fetchJson<JobQueueResponse>("/api/admin/jobs", undefined, query),
  listLegislators: (query: LegislatorQuery) =>
    fetchJson<LegislatorAnalyticsRow[]>(
      "/api/legislators",
      undefined,
      legislatorQueryToParams(query),
    ),
  listPeople: (query?: { q?: string; legislature?: string; page?: number; pageSize?: number }) =>
    fetchJson<PeopleDirectoryResponse>("/api/people", undefined, {
      legislature: query?.legislature,
      page: query?.page ? String(query.page) : undefined,
      pageSize: query?.pageSize ? String(query.pageSize) : undefined,
      q: query?.q,
    }),
  listPeriods: () => fetchJson<RemotePeriod[]>("/api/periods"),
  listSessionQuality: (scope: Scope) =>
    fetchJson<SessionQualityRow[]>(
      "/api/analytics/session-quality",
      undefined,
      scopeToParams(scope),
    ),
  listStoredPeriods: () => fetchJson<StoredPeriod[]>("/api/stored-periods"),
  processAllPeriods: (body: { legislature?: string; forceParseAll?: boolean }) =>
    fetchJson<ProcessAllPeriodsResult>("/api/crawl/process-all-periods", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  processPeriod: (body: { periodId?: string; periodPageUrl?: string; forceParseAll?: boolean }) =>
    fetchJson<ProcessPeriodResult>("/api/crawl/process-period", {
      body: JSON.stringify(body),
      method: "POST",
    }),
  updateLegislatorProfile: (id: string, body: { imageUrl?: string | null; bio?: string | null }) =>
    fetchJson(`/api/admin/legislators/${id}/profile`, {
      body: JSON.stringify(body),
      method: "PATCH",
    }),
};
