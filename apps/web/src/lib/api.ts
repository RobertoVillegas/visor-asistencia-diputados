const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001"

export type StoredPeriod = {
  id: string
  label: string
  legislature: string
  yearSpan: string
  periodPageUrl: string
  discoveredAt: string
}

export type RemotePeriod = {
  label: string
  legislature: string
  yearSpan: string
  periodPageUrl: string
}

export type LatestPeriodResponse = {
  latest: RemotePeriod | null
  stored: StoredPeriod | null
}

export type AnalyticsOverview = {
  scope: {
    legislature?: string
    periodId?: string
  }
  totalSessions: number
  parsedSessions: number
  legislatorsCount: number
  attendanceCount: number
  cedulaCount: number
  justifiedAbsenceCount: number
  absenceCount: number
  officialCommissionCount: number
  boardLeaveCount: number
  notPresentInVotesCount: number
  totalMentions: number
  attendanceRatio: number
  absenceRatio: number
  justifiedAbsenceRatio: number
}

export type PartyAnalyticsRow = {
  groupCode: string
  groupName: string
  legislature: string
  sessionCount: number
  attendanceCount: number
  cedulaCount: number
  justifiedAbsenceCount: number
  absenceCount: number
  officialCommissionCount: number
  boardLeaveCount: number
  notPresentInVotesCount: number
  totalCount: number
  attendanceRatio: number
  absenceRatio: number
  justifiedAbsenceRatio: number
}

export type PartyTrendSeries = {
  key: string
  label: string
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

export type PartyTrendsResponse = {
  scope: {
    legislature?: string
    periodId?: string
  }
  series: PartyTrendSeries[]
}

export type LegislatorAnalyticsRow = {
  id: string
  personId: string
  fullName: string
  legislature: string
  groupCode: string | null
  groupName: string | null
  imageUrl: string | null
  bio: string | null
  sessionsMentioned: number
  attendanceCount: number
  cedulaCount: number
  justifiedAbsenceCount: number
  absenceCount: number
  officialCommissionCount: number
  boardLeaveCount: number
  notPresentInVotesCount: number
  attendanceRatio: number
  absenceRatio: number
}

export type QualityOverview = {
  scope: {
    legislature?: string
    periodId?: string
  }
  totalSessions: number
  sessionsWithAttendanceDoc: number
  sessionsWithAbsenceDoc: number
  parsedSessions: number
  reconciledSessions: number
  matchedSessions: number
  mismatchedSessions: number
  changedDocuments: number
  failedSnapshots: number
  parseCoverageRatio: number
  reconciliationCoverageRatio: number
  matchRatio: number
}

export type SessionQualityRow = {
  sessionId: string
  sessionDate: string | null
  title: string
  sessionType: string
  legislature: string | null
  periodId: string | null
  periodLabel: string | null
  attendanceDocumentId: string | null
  absenceDocumentId: string | null
  lastCheckedAt: string | null
  lastChangedAt: string | null
  latestSnapshotStatus: "fetched" | "unchanged" | "changed" | "failed" | null
  parseRunCount: number
  attendanceRecordCount: number
  reconciled: "true" | "false" | null
  missingFromAttendanceCount: number
  extraInAttendanceCount: number
  groupDiffCount: number
  reconciledAt: string | null
  parseStatus: "parsed" | "discovered" | "missing_attendance_document"
  reconciliationStatus:
    | "matched"
    | "mismatched"
    | "not_reconciled"
    | "missing_absence_document"
}

export type LegislatorSummary = {
  id: string
  personId: string
  fullName: string
  legislature: string
  groupCode: string | null
  groupName: string | null
  imageUrl: string | null
  bio: string | null
  sessionsMentioned: number
  attendanceCount: number
  cedulaCount: number
  justifiedAbsenceCount: number
  absenceCount: number
  officialCommissionCount: number
  boardLeaveCount: number
  notPresentInVotesCount: number
  relatedLegislatures: Array<{
    id: string
    legislature: string
    groupCode: string | null
    groupName: string | null
    isCurrent: boolean
  }>
}

export type LegislatorAttendanceRow = {
  attendanceRecordId: string
  status: string
  rawStatus: string | null
  sessionId: string
  sessionDate: string | null
  sessionType: string
  title: string
  sessionPageUrl: string
  groupCode: string | null
  groupName: string | null
}

export type LegislatorTrend = {
  legislator: {
    id: string
    fullName: string
    groupCode: string | null
    groupName: string | null
    legislature: string
  }
  points: Array<{
    sessionDate: string | null
    sessionId: string
    sessionType: string
    title: string
    status: string
    value: 0 | 1
  }>
}

export type ApiSession = {
  user: {
    id: string
    email: string
    name?: string | null
  } | null
  session: {
    id: string
  } | null
}

export type ProcessPeriodResult = {
  period: StoredPeriod
  discoveredSessionCount?: number
  processedSessionCount?: number
  parsedSessions?: number
  reconciledSessions?: number
  failedSessions?: number
  results?: unknown[]
}

export type ProcessAllPeriodsResult = {
  legislature: string | null
  totalPeriods: number
  processedPeriods: number
  failedPeriods: number
  results?: unknown[]
}

export type JobQueueItem = {
  id: string
  type: "process_period" | "process_all_periods"
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  priority: number
  dedupeKey: string | null
  payload: Record<string, unknown>
  progress: Record<string, unknown> | null
  result: Record<string, unknown> | null
  errorMessage: string | null
  attempts: number
  maxAttempts: number
  createdByEmail: string | null
  runAt: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type JobQueueResponse = {
  stats: {
    pending: number
    running: number
    completed: number
    failed: number
  }
  jobs: JobQueueItem[]
}

export type IngestAnomalyRow = {
  id: string
  sessionId: string
  documentId: string | null
  parseRunId: string | null
  kind: string
  message: string
  snippet: string | null
  sourceUrl: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  sessionDate: string | null
  sessionTitle: string | null
  legislature: string | null
}

export type ReconciliationDetails = {
  missingFromAttendance?: string[]
  extraInAttendance?: string[]
  groupDiffs?: Array<{
    groupCode: string
    attendanceCount: number
    absenceCount: number
    difference: number
  }>
}

export type SessionInspectionResponse = {
  session: Record<string, unknown> & {
    id: string
    title: string
    sessionDate: string | null
    sessionPageUrl: string
    sourceSlug: string
  }
  period: Record<string, unknown> | null
  documents: Array<Record<string, unknown>>
  snapshots: Array<Record<string, unknown>>
  parseRuns: Array<Record<string, unknown>>
  reconciliation:
    | (Record<string, unknown> & {
        details?: ReconciliationDetails
      })
    | null
  attendancePreview: Array<Record<string, unknown>>
  anomalies: Array<Record<string, unknown> & { createdAt: string }>
  rawTextPreview: string | null
}

export type PeopleDirectoryResponse = {
  page: number
  pageSize: number
  total: number
  items: Array<{
    id: string
    legislatorId: string
    fullName: string
    normalizedName: string
    legislature: string
    groupCode: string | null
    groupName: string | null
    imageUrl: string | null
    bio: string | null
  }>
}

type Scope = {
  legislature?: string
  periodId?: string
  includePermanent?: boolean
}

type LegislatorQuery = Scope & {
  q?: string
  sort?:
    | "name"
    | "attendance_ratio"
    | "attendance_count"
    | "absence_count"
    | "justified_absence_count"
    | "sessions_mentioned"
  order?: "asc" | "desc"
}

function buildUrl(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(path, API_BASE_URL)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value)
      }
    }
  }

  return url.toString()
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  params?: Record<string, string | undefined>
) {
  const response = await fetch(buildUrl(path, params), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const error = (await response.json()) as { error?: string }
      if (error.error) {
        message = error.error
      }
    } catch {
      // Ignore JSON parse failures.
    }

    throw new Error(message)
  }

  return (await response.json()) as T
}

function scopeToParams(scope: Scope): Record<string, string | undefined> {
  return {
    legislature: scope.legislature,
    periodId: scope.periodId,
    includePermanent:
      scope.includePermanent === undefined
        ? undefined
        : String(scope.includePermanent),
  }
}

function legislatorQueryToParams(
  query: LegislatorQuery
): Record<string, string | undefined> {
  return {
    ...scopeToParams(query),
    q: query.q,
    sort: query.sort,
    order: query.order,
  }
}

export const api = {
  baseUrl: API_BASE_URL,
  listPeriods: () => fetchJson<RemotePeriod[]>("/api/periods"),
  getLatestPeriod: () => fetchJson<LatestPeriodResponse>("/api/periods/latest"),
  listStoredPeriods: () => fetchJson<StoredPeriod[]>("/api/stored-periods"),
  getOverview: (scope: Scope) =>
    fetchJson<AnalyticsOverview>(
      "/api/analytics/overview",
      undefined,
      scopeToParams(scope)
    ),
  getParties: (scope: Scope) =>
    fetchJson<PartyAnalyticsRow[]>("/api/analytics/parties", undefined, {
      ...scopeToParams(scope),
      order: "desc",
    }),
  getPartyTrends: (scope: Scope) =>
    fetchJson<PartyTrendsResponse>(
      "/api/analytics/trends/parties",
      undefined,
      scopeToParams(scope)
    ),
  listLegislators: (query: LegislatorQuery) =>
    fetchJson<LegislatorAnalyticsRow[]>(
      "/api/legislators",
      undefined,
      legislatorQueryToParams(query)
    ),
  getQuality: (scope: Scope) =>
    fetchJson<QualityOverview>(
      "/api/analytics/quality",
      undefined,
      scopeToParams(scope)
    ),
  listSessionQuality: (scope: Scope) =>
    fetchJson<SessionQualityRow[]>(
      "/api/analytics/session-quality",
      undefined,
      scopeToParams(scope)
    ),
  getLegislator: (id: string) =>
    fetchJson<LegislatorSummary>(`/api/legislators/${id}`),
  getPerson: (id: string, scope?: { legislature?: string }) =>
    fetchJson<LegislatorSummary>(`/api/people/${id}`, undefined, {
      legislature: scope?.legislature,
    }),
  getLegislatorAttendance: (id: string) =>
    fetchJson<LegislatorAttendanceRow[]>(`/api/legislators/${id}/attendance`),
  getPersonAttendance: (id: string, scope?: { legislature?: string }) =>
    fetchJson<LegislatorAttendanceRow[]>(`/api/people/${id}/attendance`, undefined, {
      legislature: scope?.legislature,
    }),
  getLegislatorTrend: (id: string, scope: Scope) =>
    fetchJson<LegislatorTrend>(
      `/api/analytics/trends/legislator/${id}`,
      undefined,
      scopeToParams(scope)
    ),
  getPersonTrend: (id: string, scope: Scope) =>
    fetchJson<LegislatorTrend>(
      `/api/analytics/trends/person/${id}`,
      undefined,
      scopeToParams(scope)
    ),
  getSession: () => fetchJson<ApiSession>("/api/session"),
  processPeriod: (body: {
    periodId?: string
    periodPageUrl?: string
    forceParseAll?: boolean
  }) =>
    fetchJson<ProcessPeriodResult>("/api/crawl/process-period", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  processAllPeriods: (body: {
    legislature?: string
    forceParseAll?: boolean
  }) =>
    fetchJson<ProcessAllPeriodsResult>("/api/crawl/process-all-periods", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listJobs: (query?: {
    status?: "pending" | "running" | "completed" | "failed" | "cancelled"
    type?: "process_period" | "process_all_periods"
  }) => fetchJson<JobQueueResponse>("/api/admin/jobs", undefined, query),
  enqueueProcessPeriodJob: (body: {
    periodId?: string
    periodPageUrl?: string
    forceParseAll?: boolean
  }) =>
    fetchJson<JobQueueItem>("/api/admin/jobs/process-period", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  enqueueProcessAllPeriodsJob: (body: {
    legislature?: string
    forceParseAll?: boolean
  }) =>
    fetchJson<JobQueueItem>("/api/admin/jobs/process-all-periods", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listPeople: (query?: {
    q?: string
    legislature?: string
    page?: number
    pageSize?: number
  }) =>
    fetchJson<PeopleDirectoryResponse>("/api/people", undefined, {
      q: query?.q,
      legislature: query?.legislature,
      page: query?.page ? String(query.page) : undefined,
      pageSize: query?.pageSize ? String(query.pageSize) : undefined,
    }),
  updateLegislatorProfile: (
    id: string,
    body: { imageUrl?: string | null; bio?: string | null }
  ) =>
    fetchJson(`/api/admin/legislators/${id}/profile`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listIngestAnomalies: (query?: {
    legislature?: string
    kind?: string
    limit?: number
  }) =>
    fetchJson<IngestAnomalyRow[]>("/api/admin/anomalies", undefined, {
      legislature: query?.legislature,
      kind: query?.kind,
      limit: query?.limit ? String(query.limit) : undefined,
    }),
  getSessionInspection: (sessionId: string) =>
    fetchJson<SessionInspectionResponse>(
      `/api/admin/sessions/${sessionId}/inspection`
    ),
  cleanupInvalidGroups: (body: { legislature?: string }) =>
    fetchJson<{
      deleted: number
      groups: Array<{ code: string; name: string; legislature: string }>
    }>("/api/admin/cleanup-invalid-groups", {
      method: "POST",
      body: JSON.stringify(body),
    }),
}
