import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useEffect, useMemo, useState } from "react"

import { LegislatorsTable } from "../components/legislators-table"
import { api } from "../lib/api"
import { formatCompactDate, formatInteger, formatPercent } from "../lib/format"

type DashboardSearch = {
  legislature?: string
  periodId?: string
}

const PARTY_COLORS = [
  "#6e342d",
  "#a0522d",
  "#b38b59",
  "#586b4f",
  "#345c69",
  "#7b4b94",
]

const LEGISLATOR_SORT_OPTIONS: Array<{
  value:
    | "name"
    | "attendance_ratio"
    | "attendance_count"
    | "absence_count"
    | "justified_absence_count"
    | "sessions_mentioned"
  label: string
}> = [
  { value: "attendance_ratio", label: "Mejor porcentaje de asistencia" },
  { value: "attendance_count", label: "Más asistencias registradas" },
  { value: "sessions_mentioned", label: "Más sesiones registradas" },
  { value: "absence_count", label: "Más inasistencias" },
  { value: "justified_absence_count", label: "Más justificadas" },
  { value: "name", label: "Nombre (A-Z)" },
]

export const Route = createFileRoute("/")({
  validateSearch: (search): DashboardSearch => ({
    legislature:
      typeof search.legislature === "string" ? search.legislature : undefined,
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
  component: DashboardPage,
})

function DashboardPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [legislatorSearch, setLegislatorSearch] = useState("")
  const [legislatorSort, setLegislatorSort] = useState<
    | "name"
    | "attendance_ratio"
    | "attendance_count"
    | "absence_count"
    | "justified_absence_count"
    | "sessions_mentioned"
  >("attendance_ratio")
  const [hiddenTrendSeries, setHiddenTrendSeries] = useState<Set<string>>(
    new Set()
  )

  const periodsQuery = useQuery({
    queryKey: ["dashboard-periods"],
    queryFn: async () => {
      const [remotePeriods, storedPeriods, latestResponse] = await Promise.all([
        api.listPeriods(),
        api.listStoredPeriods(),
        api.getLatestPeriod(),
      ])

      const storedByUrl = new Map(
        storedPeriods.map((period) => [period.periodPageUrl, period])
      )
      const periods = remotePeriods.map((period) => {
        const stored = storedByUrl.get(period.periodPageUrl)

        return {
          ...period,
          storedPeriodId: stored?.id,
          discoveredAt: stored?.discoveredAt,
          isImported: Boolean(stored),
        }
      })

      return {
        periods,
        latestRemote: latestResponse.latest,
      }
    },
  })

  const periods = periodsQuery.data?.periods ?? []
  const latestRemote = periodsQuery.data?.latestRemote ?? null

  const latestPeriod =
    periods.find(
      (period) => period.periodPageUrl === latestRemote?.periodPageUrl
    ) ??
    (latestRemote ? { ...latestRemote, isImported: false } : null) ??
    periods[0] ??
    null
  const selectedLegislature = search.legislature ?? latestPeriod?.legislature
  const visiblePeriods = periods.filter(
    (period) => period.legislature === selectedLegislature
  )
  const defaultVisiblePeriod =
    (latestPeriod && latestPeriod.legislature === selectedLegislature
      ? visiblePeriods.find(
          (period) => period.periodPageUrl === latestPeriod.periodPageUrl
        )
      : undefined) ??
    visiblePeriods.find((period) => period.isImported) ??
    visiblePeriods[0]
  const selectedRemotePeriod =
    visiblePeriods.find((period) => period.periodPageUrl === search.periodId) ??
    defaultVisiblePeriod
  const selectedPeriodId = selectedRemotePeriod?.storedPeriodId
  const dashboardScope = useMemo(
    () =>
      selectedLegislature && selectedPeriodId
        ? {
            legislature: selectedLegislature,
            periodId: selectedPeriodId,
            includePermanent: false,
          }
        : null,
    [selectedLegislature, selectedPeriodId]
  )

  useEffect(() => {
    if (!periods.length) return

    if (!search.legislature || !search.periodId) {
      void navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          legislature: prev.legislature ?? latestPeriod?.legislature,
          periodId: prev.periodId ?? defaultVisiblePeriod?.periodPageUrl,
        }),
      })
    }
  }, [
    defaultVisiblePeriod?.periodPageUrl,
    latestPeriod?.legislature,
    navigate,
    periods.length,
    search.legislature,
    search.periodId,
  ])

  const overviewQuery = useQuery({
    queryKey: ["analytics-overview", dashboardScope],
    queryFn: () => api.getOverview(dashboardScope!),
    enabled: Boolean(dashboardScope),
  })

  const partiesQuery = useQuery({
    queryKey: ["analytics-parties", dashboardScope],
    queryFn: () => api.getParties(dashboardScope!),
    enabled: Boolean(dashboardScope),
  })

  const trendsQuery = useQuery({
    queryKey: ["analytics-party-trends", dashboardScope],
    queryFn: () => api.getPartyTrends(dashboardScope!),
    enabled: Boolean(dashboardScope),
  })

  const qualityQuery = useQuery({
    queryKey: ["analytics-quality", dashboardScope],
    queryFn: () => api.getQuality(dashboardScope!),
    enabled: Boolean(dashboardScope),
  })

  const legislatorsQuery = useQuery({
    queryKey: [
      "analytics-legislators",
      dashboardScope,
      legislatorSearch,
      legislatorSort,
    ],
    queryFn: () =>
      api.listLegislators({
        ...dashboardScope!,
        q: legislatorSearch || undefined,
        sort: legislatorSort,
        order: legislatorSort === "name" ? "asc" : "desc",
      }),
    enabled: Boolean(dashboardScope),
    placeholderData: (previousData) => previousData,
  })

  const overview = overviewQuery.data ?? null
  const parties = partiesQuery.data ?? []
  const trends = trendsQuery.data ?? null
  const quality = qualityQuery.data ?? null
  const legislators = legislatorsQuery.data ?? []
  const isPeriodsLoading = periodsQuery.isPending
  const isLoading =
    Boolean(dashboardScope) &&
    (overviewQuery.isPending || qualityQuery.isPending)
  const isLegislatorsLoading = legislatorsQuery.isFetching
  const error =
    (periodsQuery.error as Error | null)?.message ??
    (overviewQuery.error as Error | null)?.message ??
    (partiesQuery.error as Error | null)?.message ??
    (trendsQuery.error as Error | null)?.message ??
    (qualityQuery.error as Error | null)?.message ??
    (legislatorsQuery.error as Error | null)?.message ??
    null

  const headlinePeriod = useMemo(
    () => selectedRemotePeriod ?? latestPeriod,
    [latestPeriod, selectedRemotePeriod]
  )

  // All trend series, sorted by latest resolved ratio
  const allTrendLines = useMemo(
    () =>
      (trends?.series ?? [])
        .map((series) => ({
          ...series,
          points: series.points.filter((p) => p.totalCount > 0),
        }))
        .filter((series) => series.points.length > 0)
        .sort((a, b) => {
          const lastA = a.points.at(-1)?.resolvedRatio ?? 0
          const lastB = b.points.at(-1)?.resolvedRatio ?? 0
          return lastB - lastA
        }),
    [trends]
  )

  // Visible trend lines (excluding hidden ones)
  const trendLines = useMemo(
    () => allTrendLines.filter((series) => !hiddenTrendSeries.has(series.key)),
    [allTrendLines, hiddenTrendSeries]
  )

  // Toggle series visibility
  const toggleTrendSeries = (key: string) => {
    setHiddenTrendSeries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Calcular el rango mínimo para la escala relativa
  // Usar percentil 10 para ignorar outliers (valores atípicos)
  const trendYDomain = useMemo(() => {
    // Lista de códigos de partidos principales (no outliers)
    const mainPartyCodes = new Set([
      "MORENA",
      "PAN",
      "PRI",
      "PRD",
      "PVEM",
      "PT",
      "MC",
    ])

    let allValues: number[] = []

    // Recolectar todos los valores de partidos principales
    for (const series of trendLines) {
      if (!mainPartyCodes.has(series.key)) continue

      for (const point of series.points) {
        const value = point.resolvedRatio * 100
        if (value > 0) {
          allValues.push(value)
        }
      }
    }

    // Si no hay valores, usar default
    if (allValues.length === 0) {
      return [75, 100] as [number, number]
    }

    // Calcular percentil 10 (ignora el 10% de valores más bajos - outliers)
    const sortedValues = allValues.sort((a, b) => a - b)
    const percentile10Index = Math.floor(sortedValues.length * 0.1)
    const percentile10Value = sortedValues[percentile10Index]

    // Usar el percentil 10 como base, restar 10 puntos y redondear
    const domainMin = Math.max(70, Math.floor((percentile10Value - 10) / 5) * 5)
    const domainMax = 100

    return [domainMin, domainMax] as [number, number]
  }, [trendLines])

  const trendChartData = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string
        label: string
        sessionCount: number
        [key: string]: number | string
      }
    >()

    for (const series of trendLines) {
      for (const point of series.points) {
        if (!point.sessionDate) continue

        const current = byDate.get(point.sessionDate) ?? {
          date: point.sessionDate,
          label: formatCompactDate(point.sessionDate),
          sessionCount: 0,
        }

        current[series.key] = Number(
          (point.resolvedRatio * 100).toFixed(1)
        )
        current.sessionCount = Math.max(
          Number(current.sessionCount ?? 0),
          point.aggregatedSessionCount
        )
        byDate.set(point.sessionDate, current)
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [trendLines])

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.32em] text-muted-foreground uppercase">
                Cámara de Diputados
              </p>
              <h1 className="mt-3 font-heading text-4xl leading-none text-foreground sm:text-6xl">
                Asistencia Legislativa
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Seguimiento público de asistencia, inasistencias y calidad de
                captura por legislatura y año de ejercicio.
              </p>
              <p className="mt-3 text-sm text-foreground/80">
                {headlinePeriod?.legislature ?? "Sin legislatura"} ·{" "}
                {headlinePeriod?.label ?? "Sin periodo"}
              </p>
              {!headlinePeriod?.isImported ? (
                <p className="mt-2 text-sm text-amber-800">
                  Este periodo existe en la fuente oficial, pero todavía no se
                  ha importado al backend para generar métricas públicas.
                </p>
              ) : null}
              <div className="mt-4">
                <Link
                  className="text-xs font-semibold tracking-[0.22em] uppercase underline-offset-4 hover:underline"
                  to="/people"
                >
                  Ver directorio público
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_3fr]">
              <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Legislatura
                <select
                  className="h-11 rounded-2xl border border-border bg-card px-4 text-sm font-medium tracking-normal text-foreground ring-0 outline-none"
                  onChange={(event) => {
                    const legislature = event.target.value
                    const firstPeriodForLegislature = periods.find(
                      (period) => period.legislature === legislature
                    )

                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        legislature,
                        periodId: firstPeriodForLegislature?.periodPageUrl,
                      }),
                    })
                  }}
                  value={selectedLegislature}
                >
                  {Array.from(
                    new Set(periods.map((period) => period.legislature))
                  ).map((legislature) => (
                    <option key={legislature} value={legislature}>
                      {legislature}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                Año de ejercicio
                <select
                  className="h-11 rounded-2xl border border-border bg-card px-4 text-sm font-medium tracking-normal text-foreground ring-0 outline-none"
                  onChange={(event) => {
                    const periodId = event.target.value
                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        periodId,
                      }),
                    })
                  }}
                  value={selectedRemotePeriod?.periodPageUrl}
                >
                  {visiblePeriods.map((period) => (
                    <option
                      key={period.periodPageUrl}
                      value={period.periodPageUrl}
                    >
                      {period.label}
                      {period.isImported ? "" : " · pendiente de importar"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase sm:col-span-2">
                Buscar nombre
                <input
                  className="h-11 rounded-2xl border border-border bg-card px-4 text-sm font-medium tracking-normal text-foreground ring-0 outline-none placeholder:text-muted-foreground"
                  onChange={(event) => setLegislatorSearch(event.target.value)}
                  placeholder="Ej. Ramírez, Batres, Monreal"
                  value={legislatorSearch}
                />
              </label>
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : null}

        {isPeriodsLoading ? (
          <section className="rounded-3xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Cargando periodos…
          </section>
        ) : !selectedRemotePeriod?.isImported ? (
          <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
            El periodo seleccionado aún no tiene datos importados. Para verlo
            con métricas, primero hay que correr el pipeline desde{" "}
            <code>/admin</code>.
          </section>
        ) : isLoading || !overview || !quality ? (
          <section className="rounded-3xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Cargando dashboard…
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                eyebrow="Cobertura"
                title={formatInteger(overview.parsedSessions)}
                subtitle={`${formatInteger(overview.totalSessions)} sesiones detectadas`}
              >
                {formatPercent(quality.parseCoverageRatio)} con registros
                normalizados
              </MetricCard>
              <MetricCard
                eyebrow="Asistencia"
                title={formatPercent(overview.attendanceRatio)}
                subtitle={`${formatInteger(overview.attendanceCount)} asistencias`}
              >
                {formatInteger(overview.totalMentions)} menciones totales
              </MetricCard>
              <MetricCard
                eyebrow="Inasistencias"
                title={formatInteger(overview.absenceCount)}
                subtitle={`${formatPercent(overview.absenceRatio)} del total`}
              >
                {formatInteger(overview.justifiedAbsenceCount)} justificadas
              </MetricCard>
              <MetricCard
                eyebrow="Conciliación"
                title={formatPercent(quality.matchRatio)}
                subtitle={`${formatInteger(quality.reconciledSessions)} sesiones conciliadas`}
              >
                {formatInteger(quality.mismatchedSessions)} con diferencias
              </MetricCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
              <Panel
                description="Porcentaje de participación en sesiones plenarias por grupo parlamentario."
                title="Participación por partido"
              >
                {parties.length === 0 ? (
                  <div className="flex h-80 items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p className="text-sm">No hay datos disponibles</p>
                      <p className="mt-1 text-xs">
                        Selecciona un periodo importado
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={parties.map((party) => ({
                          code: party.groupCode,
                          participacion: Number(
                            (
                              ((party.attendanceCount +
                                party.cedulaCount +
                                party.officialCommissionCount) /
                                party.totalCount) *
                              100
                            ).toFixed(1)
                          ),
                          justificada: Number(
                            (
                              (party.justifiedAbsenceCount / party.totalCount) *
                              100
                            ).toFixed(1)
                          ),
                          inasistencia: Number(
                            (
                              ((party.absenceCount +
                                party.boardLeaveCount +
                                party.notPresentInVotesCount) /
                                party.totalCount) *
                              100
                            ).toFixed(1)
                          ),
                        }))}
                        margin={{ left: 50, right: 20, top: 10, bottom: 10 }}
                      >
                        <CartesianGrid
                          stroke="rgba(122, 97, 64, 0.12)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => `${v}%`}
                          domain={[0, 100]}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          dataKey="code"
                          type="category"
                          width={50}
                          tickLine={false}
                          axisLine={false}
                          style={{ fontSize: "11px", fontWeight: 500 }}
                        />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend wrapperStyle={{ paddingTop: "10px" }} />
                        <Bar
                          dataKey="participacion"
                          stackId="a"
                          fill="#4a7c59"
                          name="Participación"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="justificada"
                          stackId="a"
                          fill="#d4a574"
                          name="Justificada"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="inasistencia"
                          stackId="a"
                          fill="#8b4513"
                          name="Inasistencia"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Panel>

              <Panel
                description="Evolución del estatus resuelto por sesión para los grupos con más presencia. Incluye asistencia, cédula, comisión oficial e inasistencia justificada. No incluye sesiones de Comisión Permanente."
                title="Tendencia reciente"
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData}>
                      <CartesianGrid
                        stroke="rgba(122, 97, 64, 0.12)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `${value}%`}
                        tickLine={false}
                        axisLine={false}
                        domain={trendYDomain}
                      />
                      <Tooltip content={<TrendTooltip />} />
                      {trendLines.map((series, index) => (
                        <Line
                          dataKey={series.key}
                          dot={false}
                          key={series.key}
                          name={series.label}
                          stroke={PARTY_COLORS[index % PARTY_COLORS.length]}
                          strokeWidth={2.5}
                          type="monotone"
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Custom clickable legend */}
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {allTrendLines.map((series, index) => {
                    const isHidden = hiddenTrendSeries.has(series.key)
                    return (
                      <button
                        key={series.key}
                        type="button"
                        onClick={() => toggleTrendSeries(series.key)}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all ${
                          isHidden
                            ? "border-border/50 bg-muted/50 text-muted-foreground"
                            : "border-border bg-card text-foreground"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: isHidden
                              ? "#ccc"
                              : PARTY_COLORS[index % PARTY_COLORS.length],
                          }}
                        />
                        <span className={isHidden ? "line-through" : ""}>
                          {series.label}
                        </span>
                        {isHidden && (
                          <span className="text-xs text-muted-foreground">
                            (oculto)
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </Panel>
            </section>

            <Panel
              description="Listado de legisladores con métricas individuales de asistencia."
              headerRight={
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Ordenar por
                  </span>
                  <select
                    className="h-10 min-w-0 rounded-2xl border border-border bg-background px-4 text-sm text-foreground sm:min-w-72"
                    onChange={(event) =>
                      setLegislatorSort(
                        event.target.value as typeof legislatorSort
                      )
                    }
                    value={legislatorSort}
                  >
                    {LEGISLATOR_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              }
              title="Legisladores"
            >
              <LegislatorsTable
                legislators={legislators}
                legislature={selectedLegislature}
                loading={isLegislatorsLoading}
                periodId={selectedPeriodId}
              />
            </Panel>
          </>
        )}
      </div>
    </main>
  )
}

function TrendTooltip(props: {
  active?: boolean
  label?: string
  payload?: Array<{
    color?: string
    dataKey?: string | number
    name?: string
    value?: number | string
    payload?: { sessionCount?: number }
  }>
}) {
  const active = props.active
  const label = props.label
  const payload = props.payload

  if (!active || !payload?.length) return null

  const sessionCount = Number(payload[0]?.payload?.sessionCount ?? 1)

  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">
        {sessionCount > 1
          ? `${sessionCount} sesiones agregadas`
          : "1 sesión"}
      </p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div
            key={String(entry.dataKey)}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-medium text-foreground">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5">
      <p className="text-xs font-semibold tracking-[0.26em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-4 font-heading text-4xl leading-none text-foreground">
        {title}
      </h2>
      <p className="mt-3 text-sm font-medium text-foreground/80">{subtitle}</p>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </article>
  )
}

function Panel({
  title,
  description,
  headerRight,
  children,
}: {
  title: string
  description: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {headerRight ? <div className="sm:shrink-0">{headerRight}</div> : null}
      </div>
      {children}
    </section>
  )
}
