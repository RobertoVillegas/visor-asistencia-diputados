import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";

import { LegislatorsTable } from "../components/legislators-table";
import { FadeIn, StaggerItem, StaggerList, SwappableContent } from "../components/reveal";
import { api } from "../lib/api";
import { formatCompactDate, formatInteger, formatPercent } from "../lib/format";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { usePeriodResolver } from "../lib/use-period-resolver";

const LEGISLATOR_SORT_VALUES = [
  "name",
  "participation_ratio",
  "participation_ratio_asc",
  "attendance_count",
  "absence_count",
  "justified_absence_count",
  "sessions_mentioned",
] as const;

type LegislatorSortValue = (typeof LEGISLATOR_SORT_VALUES)[number];

const DEFAULT_LEGISLATOR_SORT: LegislatorSortValue = "participation_ratio";

function isLegislatorSort(value: unknown): value is LegislatorSortValue {
  return typeof value === "string" && LEGISLATOR_SORT_VALUES.includes(value as LegislatorSortValue);
}

interface DashboardSearch {
  legislature?: string;
  periodId?: string;
  legislatorSearch?: string;
  legislatorSort?: LegislatorSortValue;
  legislatorGroups?: string;
  hiddenSeries?: string;
}

const PARTY_COLORS = ["#6e342d", "#a0522d", "#b38b59", "#586b4f", "#345c69", "#7b4b94"];

const LEGISLATOR_SORT_OPTIONS: {
  value: LegislatorSortValue;
  label: string;
}[] = [
  { label: "Mayor porcentaje de participación", value: "participation_ratio" },
  { label: "Menor porcentaje de participación", value: "participation_ratio_asc" },
  { label: "Más asistencias registradas", value: "attendance_count" },
  { label: "Más sesiones registradas", value: "sessions_mentioned" },
  { label: "Más inasistencias", value: "absence_count" },
  { label: "Más justificadas", value: "justified_absence_count" },
  { label: "Nombre (A-Z)", value: "name" },
];

export const Route = createFileRoute("/")({
  component: DashboardPage,
  validateSearch: (search): DashboardSearch => ({
    hiddenSeries:
      typeof search.hiddenSeries === "string" && search.hiddenSeries.length > 0
        ? search.hiddenSeries
        : undefined,
    legislatorGroups:
      typeof search.legislatorGroups === "string" && search.legislatorGroups.length > 0
        ? search.legislatorGroups
        : undefined,
    legislatorSearch:
      typeof search.legislatorSearch === "string" && search.legislatorSearch.length > 0
        ? search.legislatorSearch
        : undefined,
    legislatorSort: isLegislatorSort(search.legislatorSort) ? search.legislatorSort : undefined,
    legislature: typeof search.legislature === "string" ? search.legislature : undefined,
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const legislatorSort = search.legislatorSort ?? DEFAULT_LEGISLATOR_SORT;
  const urlLegislatorSearch = search.legislatorSearch ?? "";
  const hiddenTrendSeries = useMemo(
    () => new Set((search.hiddenSeries ?? "").split(",").filter(Boolean)),
    [search.hiddenSeries],
  );
  const selectedGroupCodes = useMemo(
    () => new Set((search.legislatorGroups ?? "").split(",").filter(Boolean)),
    [search.legislatorGroups],
  );

  const [legislatorSearchInput, setLegislatorSearchInput] = useState(urlLegislatorSearch);

  useEffect(() => {
    setLegislatorSearchInput((current) =>
      current === urlLegislatorSearch ? current : urlLegislatorSearch,
    );
  }, [urlLegislatorSearch]);

  const debouncedLegislatorSearch = useDebouncedValue(legislatorSearchInput, 350);

  useEffect(() => {
    if (debouncedLegislatorSearch === urlLegislatorSearch) {
      return;
    }
    void navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        legislatorSearch: debouncedLegislatorSearch || undefined,
      }),
    });
  }, [debouncedLegislatorSearch, navigate, urlLegislatorSearch]);

  const setLegislatorSort = (value: LegislatorSortValue) => {
    void navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        legislatorSort: value === DEFAULT_LEGISLATOR_SORT ? undefined : value,
      }),
    });
  };

  const toggleLegislatorGroup = (code: string) => {
    void navigate({
      replace: true,
      search: (prev) => {
        const current = new Set((prev.legislatorGroups ?? "").split(",").filter(Boolean));
        if (current.has(code)) {
          current.delete(code);
        } else {
          current.add(code);
        }
        const next = [...current].join(",");
        return {
          ...prev,
          legislatorGroups: next.length > 0 ? next : undefined,
        };
      },
    });
  };

  const clearLegislatorGroups = () => {
    void navigate({
      replace: true,
      search: (prev) => ({ ...prev, legislatorGroups: undefined }),
    });
  };

  const toggleTrendSeries = (key: string) => {
    void navigate({
      replace: true,
      search: (prev) => {
        const current = new Set((prev.hiddenSeries ?? "").split(",").filter(Boolean));
        if (current.has(key)) {
          current.delete(key);
        } else {
          current.add(key);
        }
        const next = [...current].join(",");
        return {
          ...prev,
          hiddenSeries: next.length > 0 ? next : undefined,
        };
      },
    });
  };

  const {
    error: periodsError,
    isLoading: isPeriodsLoading,
    latestRemotePeriod,
    periods,
    selectedPeriod: explicitSelectedPeriod,
    selectedStoredPeriodId: explicitSelectedStoredPeriodId,
  } = usePeriodResolver({
    legislature: search.legislature,
    periodPageUrl: search.periodId,
  });

  const latestPeriod =
    periods.find((period) => period.periodPageUrl === latestRemotePeriod?.periodPageUrl) ??
    latestRemotePeriod ??
    periods[0] ??
    null;
  const selectedLegislature = search.legislature ?? latestPeriod?.legislature;
  const visiblePeriods = periods.filter((period) => period.legislature === selectedLegislature);
  const defaultVisiblePeriod =
    (latestPeriod && latestPeriod.legislature === selectedLegislature
      ? visiblePeriods.find((period) => period.periodPageUrl === latestPeriod.periodPageUrl)
      : undefined) ??
    visiblePeriods.find((period) => period.isImported) ??
    visiblePeriods[0];
  const selectedRemotePeriod = explicitSelectedPeriod ?? defaultVisiblePeriod;
  const selectedPeriodId = explicitSelectedStoredPeriodId ?? defaultVisiblePeriod?.storedPeriodId;
  const dashboardScope = useMemo(
    () =>
      selectedLegislature && selectedPeriodId
        ? {
            includePermanent: false,
            legislature: selectedLegislature,
            periodId: selectedPeriodId,
          }
        : null,
    [selectedLegislature, selectedPeriodId],
  );

  useEffect(() => {
    if (!periods.length) {
      return;
    }

    if (!search.legislature || !search.periodId) {
      void navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          legislature: prev.legislature ?? latestPeriod?.legislature,
          periodId: prev.periodId ?? defaultVisiblePeriod?.periodPageUrl,
        }),
      });
    }
  }, [
    defaultVisiblePeriod?.periodPageUrl,
    latestPeriod?.legislature,
    navigate,
    periods.length,
    search.legislature,
    search.periodId,
  ]);

  const overviewQuery = useQuery({
    enabled: Boolean(dashboardScope),
    queryFn: () => api.getOverview(dashboardScope!),
    queryKey: ["analytics-overview", dashboardScope],
  });

  const partiesQuery = useQuery({
    enabled: Boolean(dashboardScope),
    queryFn: () => api.getParties(dashboardScope!),
    queryKey: ["analytics-parties", dashboardScope],
  });

  const trendsQuery = useQuery({
    enabled: Boolean(dashboardScope),
    queryFn: () => api.getPartyTrends(dashboardScope!),
    queryKey: ["analytics-party-trends", dashboardScope],
  });

  const qualityQuery = useQuery({
    enabled: Boolean(dashboardScope),
    queryFn: () => api.getQuality(dashboardScope!),
    queryKey: ["analytics-quality", dashboardScope],
  });

  const legislatorsQuery = useQuery({
    enabled: Boolean(dashboardScope),
    placeholderData: (previousData) => previousData,
    queryFn: () => {
      const ascendingSorts: LegislatorSortValue[] = ["name", "participation_ratio_asc"];
      const sort =
        legislatorSort === "participation_ratio_asc" ? "participation_ratio" : legislatorSort;

      return api.listLegislators({
        ...dashboardScope!,
        order: ascendingSorts.includes(legislatorSort) ? "asc" : "desc",
        q: urlLegislatorSearch || undefined,
        sort,
      });
    },
    queryKey: ["analytics-legislators", dashboardScope, urlLegislatorSearch, legislatorSort],
  });

  const overview = overviewQuery.data ?? null;
  const parties = partiesQuery.data ?? [];
  const trends = trendsQuery.data ?? null;
  const quality = qualityQuery.data ?? null;
  const allLegislators = legislatorsQuery.data ?? [];
  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of allLegislators) {
      const code = row.groupCode ?? "Sin grupo";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }, [allLegislators]);
  const legislators = useMemo(() => {
    if (selectedGroupCodes.size === 0) {
      return allLegislators;
    }
    return allLegislators.filter((row) => selectedGroupCodes.has(row.groupCode ?? "Sin grupo"));
  }, [allLegislators, selectedGroupCodes]);
  const isLoading = Boolean(dashboardScope) && (overviewQuery.isPending || qualityQuery.isPending);
  const isLegislatorsLoading = legislatorsQuery.isFetching;
  const error =
    periodsError?.message ??
    (overviewQuery.error as Error | null)?.message ??
    (partiesQuery.error as Error | null)?.message ??
    (trendsQuery.error as Error | null)?.message ??
    (qualityQuery.error as Error | null)?.message ??
    (legislatorsQuery.error as Error | null)?.message ??
    null;

  const headlinePeriod = useMemo(
    () => selectedRemotePeriod ?? latestPeriod,
    [latestPeriod, selectedRemotePeriod],
  );

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
          const lastA = a.points.at(-1)?.resolvedRatio ?? 0;
          const lastB = b.points.at(-1)?.resolvedRatio ?? 0;
          return lastB - lastA;
        }),
    [trends],
  );

  const trendLines = useMemo(
    () => allTrendLines.filter((series) => !hiddenTrendSeries.has(series.key)),
    [allTrendLines, hiddenTrendSeries],
  );

  // Calcular el rango mínimo para la escala relativa
  // Usar percentil 10 para ignorar outliers (valores atípicos)
  const trendYDomain = useMemo(() => {
    // Lista de códigos de partidos principales (no outliers)
    const mainPartyCodes = new Set(["MORENA", "PAN", "PRI", "PRD", "PVEM", "PT", "MC"]);

    const allValues: number[] = [];

    // Recolectar todos los valores de partidos principales
    for (const series of trendLines) {
      if (!mainPartyCodes.has(series.key)) {
        continue;
      }

      for (const point of series.points) {
        const value = point.resolvedRatio * 100;
        if (value > 0) {
          allValues.push(value);
        }
      }
    }

    // Si no hay valores, usar default
    if (allValues.length === 0) {
      return [75, 100] as [number, number];
    }

    // Calcular percentil 10 (ignora el 10% de valores más bajos - outliers)
    const sortedValues = [...allValues].sort((a, b) => a - b);
    const percentile10Index = Math.floor(sortedValues.length * 0.1);
    const percentile10Value = sortedValues[percentile10Index];

    // Dar contexto visual sin comprimir toda la variación en 0-100.
    const domainMin = Math.max(50, Math.floor((percentile10Value - 15) / 5) * 5);
    const domainMax = 100;

    return [domainMin, domainMax] as [number, number];
  }, [trendLines]);

  const trendChartData = useMemo(() => {
    const byDate = new Map<
      string,
      {
        date: string;
        label: string;
        sessionCount: number;
        [key: string]: number | string;
      }
    >();

    for (const series of trendLines) {
      for (const point of series.points) {
        if (!point.sessionDate) {
          continue;
        }

        const current = byDate.get(point.sessionDate) ?? {
          date: point.sessionDate,
          label: formatCompactDate(point.sessionDate),
          sessionCount: 0,
        };

        current[series.key] = Number((point.resolvedRatio * 100).toFixed(1));
        current.sessionCount = Math.max(
          Number(current.sessionCount ?? 0),
          point.aggregatedSessionCount,
        );
        byDate.set(point.sessionDate, current);
      }
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [trendLines]);

  const partyChartData = useMemo(
    () =>
      parties.map((party) => {
        const total = party.totalCount || 1;
        const participacionRaw =
          ((party.attendanceCount + party.cedulaCount + party.officialCommissionCount) / total) *
          100;
        const justificadaRaw = (party.justifiedAbsenceCount / total) * 100;

        const participacion = Number(participacionRaw.toFixed(1));
        const justificada = Number(justificadaRaw.toFixed(1));
        const inasistencia = Number(Math.max(0, 100 - participacion - justificada).toFixed(1));

        return {
          code: party.groupCode,
          inasistencia,
          justificada,
          participacion,
          totalVisible: Number((participacion + justificada + inasistencia).toFixed(1)),
        };
      }),
    [parties],
  );

  const contentStateKey = [
    selectedLegislature ?? "none",
    selectedRemotePeriod?.periodPageUrl ?? "none",
    overview ? "ready" : "loading",
  ].join(":");

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <FadeIn>
          <section className="surface-panel hairline-grid overflow-hidden rounded-[2.25rem] border border-border/80 px-6 py-6 sm:px-8 sm:py-8">
            <div className="grid gap-8 xl:grid-cols-[1.35fr_0.95fr]">
              <div className="max-w-4xl">
                <p className="eyebrow">Camara de Diputados · Mexico</p>
                <h1 className="text-balance-pretty mt-4 max-w-3xl font-heading text-4xl leading-tight text-foreground sm:text-5xl sm:leading-none lg:text-7xl">
                  Asistencia legislativa con lectura publica y contexto.
                </h1>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-foreground/78 sm:text-base">
                  Un tablero para revisar presencia, inasistencias y calidad de captura en las
                  sesiones del Congreso mexicano, sin esconder el contexto operativo detras de los
                  porcentajes.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <span className="rounded-full border border-border/80 bg-background/70 px-4 py-2 text-xs font-semibold tracking-[0.18em] text-foreground/80 uppercase">
                    {headlinePeriod?.legislature ?? "Sin legislatura"}
                  </span>
                  <span className="rounded-full border border-border/80 bg-background/70 px-4 py-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {headlinePeriod?.label ?? "Sin periodo"}
                  </span>
                </div>
                {!headlinePeriod?.isImported ? (
                  <p className="mt-4 max-w-2xl rounded-2xl bg-amber-100/80 px-4 py-3 text-sm text-amber-900">
                    Este periodo existe en la fuente oficial, pero aun no ha sido importado al
                    backend para construir metricas publicas.
                  </p>
                ) : null}
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-xs font-semibold tracking-[0.22em] text-primary-foreground uppercase shadow-sm"
                    to="/people"
                  >
                    Explorar directorio
                  </Link>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                    La vista prioriza la lectura rapida de cambios por legislatura y periodo, no
                    solo el resumen agregado.
                  </p>
                </div>
              </div>

              <div className="surface-soft rounded-[2rem] border border-border/80 p-4 sm:p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_3fr] xl:grid-cols-1">
                  <label className="flex min-w-0 flex-col gap-2">
                    <span className="eyebrow">Legislatura</span>
                    <select
                      className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm font-medium text-foreground outline-none"
                      onChange={(event) => {
                        const legislature = event.target.value;
                        const firstPeriodForLegislature = periods.find(
                          (period) => period.legislature === legislature,
                        );

                        void navigate({
                          search: (prev) => ({
                            ...prev,
                            legislature,
                            periodId: firstPeriodForLegislature?.periodPageUrl,
                          }),
                        });
                      }}
                      value={selectedLegislature}
                    >
                      {[...new Set(periods.map((period) => period.legislature))].map(
                        (legislature) => (
                          <option key={legislature} value={legislature}>
                            {legislature}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="flex min-w-0 flex-col gap-2">
                    <span className="eyebrow">Ano de ejercicio</span>
                    <select
                      className="h-12 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm font-medium text-foreground outline-none"
                      onChange={(event) => {
                        void navigate({
                          search: (prev) => ({
                            ...prev,
                            periodId: event.target.value,
                          }),
                        });
                      }}
                      value={selectedRemotePeriod?.periodPageUrl}
                    >
                      {visiblePeriods.map((period) => (
                        <option key={period.periodPageUrl} value={period.periodPageUrl}>
                          {period.label}
                          {period.isImported ? "" : " · pendiente de importar"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <MiniNote
                    label="Fuente"
                    value="Gaceta Parlamentaria"
                    detail="Se lee el periodo oficial publicado para cada legislatura."
                  />
                  <MiniNote
                    label="Cobertura"
                    value={formatInteger(periods.filter((period) => period.isImported).length)}
                    detail="Periodos disponibles con datos procesados."
                  />
                  <MiniNote
                    label="Enfoque"
                    value="Sesion plenaria"
                    detail="La vista publica excluye Comision Permanente del agregado."
                  />
                </div>
              </div>
            </div>
          </section>
        </FadeIn>

        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : null}

        <SwappableContent contentKey={contentStateKey}>
          {isPeriodsLoading ? (
            <DashboardSkeleton label="Cargando periodos..." />
          ) : !selectedRemotePeriod?.isImported ? (
            <section className="rounded-[2rem] border border-amber-300 bg-amber-50/90 p-6 text-sm text-amber-900">
              El periodo seleccionado aun no tiene informacion publica disponible en este tablero.
            </section>
          ) : isLoading || !overview || !quality ? (
            <DashboardSkeleton label="Cargando dashboard..." />
          ) : (
            <StaggerList className="flex flex-col gap-6">
              <StaggerItem>
                <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr_0.95fr]">
                  <MetricCard
                    detail={`${formatInteger(overview.totalMentions)} menciones registradas`}
                    eyebrow="Asistencia general"
                    subtitle={`${formatInteger(overview.attendanceCount)} asistencias resueltas`}
                    title={formatPercent(overview.attendanceRatio)}
                    tone="primary"
                  >
                    Proporcion de registros con presencia efectiva en el periodo seleccionado.
                  </MetricCard>
                  <MetricCard
                    detail={`${formatInteger(quality.reconciledSessions)} sesiones revisadas`}
                    eyebrow="Consistencia"
                    subtitle={`${formatPercent(quality.matchRatio)} con informacion consistente`}
                    title={formatInteger(quality.mismatchedSessions)}
                  >
                    Casos donde la informacion publicada presenta diferencias o requiere mayor
                    contexto.
                  </MetricCard>
                  <MetricCard
                    detail={`${formatInteger(overview.justifiedAbsenceCount)} justificadas`}
                    eyebrow="Inasistencias"
                    subtitle={`${formatPercent(overview.absenceRatio)} del total registrado`}
                    title={formatInteger(overview.absenceCount)}
                  >
                    Incluye ausencias y estados no presentes vinculados a votacion.
                  </MetricCard>
                </section>
              </StaggerItem>

              <StaggerItem>
                <section className="grid gap-6 xl:grid-cols-[1.05fr_1.3fr]">
                  <Panel
                    bodyClassName="flex flex-1 flex-col"
                    className="flex h-full flex-col"
                    description="Distribucion del estatus resuelto por grupo parlamentario en sesiones plenarias."
                    title="Participacion por partido"
                    variant="editorial"
                  >
                    {parties.length === 0 ? (
                      <EmptyPanelMessage />
                    ) : (
                      <div className="flex min-h-[28rem] flex-1 flex-col">
                        <div className="min-h-[22rem] flex-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={partyChartData}
                              margin={{
                                bottom: 10,
                                left: 8,
                                right: 8,
                                top: 10,
                              }}
                            >
                              <CartesianGrid stroke="rgba(122, 97, 64, 0.12)" vertical={false} />
                              <XAxis
                                axisLine={false}
                                dataKey="code"
                                tickLine={false}
                                type="category"
                                interval={0}
                                style={{
                                  fill: "#6f5944",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                }}
                              />
                              <YAxis
                                axisLine={false}
                                domain={[0, 100]}
                                allowDataOverflow
                                tickLine={false}
                                ticks={[0, 25, 50, 75, 100]}
                                tickFormatter={(v) =>
                                  Number(v).toFixed(0) === "100" ? "100%" : `${v}%`
                                }
                                type="number"
                                style={{
                                  fill: "#6f5944",
                                  fontSize: "11px",
                                  fontWeight: 500,
                                }}
                              />
                              <Tooltip content={<PartyTooltip />} />
                              <Bar
                                dataKey="participacion"
                                fill="#486c57"
                                name="Participacion"
                                radius={[4, 4, 0, 0]}
                                stackId="a"
                              />
                              <Bar
                                dataKey="justificada"
                                fill="#d6a15e"
                                name="Justificada"
                                radius={[0, 0, 0, 0]}
                                stackId="a"
                              />
                              <Bar
                                dataKey="inasistencia"
                                fill="#8a4c2d"
                                name="Inasistencia"
                                radius={[0, 0, 0, 0]}
                                stackId="a"
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          <LegendChip color="#8a4c2d" label="Inasistencia" />
                          <LegendChip color="#d6a15e" label="Justificada" />
                          <LegendChip color="#486c57" label="Participacion" />
                        </div>
                      </div>
                    )}
                  </Panel>

                  <Panel
                    description="Evolucion del estatus resuelto por sesion para los grupos con mas presencia. El cambio de periodo y la visibilidad de series se suavizan, pero sin retrasar la lectura."
                    headerRight={
                      <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                        {trendYDomain[0]}%-100% · Escala recortada
                      </span>
                    }
                    title="Tendencia reciente"
                  >
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendChartData}>
                          <CartesianGrid stroke="rgba(122, 97, 64, 0.12)" vertical={false} />
                          <XAxis axisLine={false} dataKey="label" tickLine={false} />
                          <YAxis
                            axisLine={false}
                            domain={trendYDomain}
                            tickFormatter={(value) => `${value}%`}
                            tickLine={false}
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
                    <div className="mt-5 flex flex-wrap gap-2">
                      {allTrendLines.map((series, index) => {
                        const isHidden = hiddenTrendSeries.has(series.key);
                        return (
                          <button
                            key={series.key}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${
                              isHidden
                                ? "border-border/60 bg-background/65 text-muted-foreground"
                                : "border-border/80 bg-card/90 text-foreground"
                            }`}
                            onClick={() => toggleTrendSeries(series.key)}
                            type="button"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: isHidden
                                  ? "#c5b9aa"
                                  : PARTY_COLORS[index % PARTY_COLORS.length],
                              }}
                            />
                            <span className={isHidden ? "line-through" : ""}>{series.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Panel>
                </section>
              </StaggerItem>

              <StaggerItem>
                <Panel
                  description="Listado individual con metricas de asistencia para seguir patrones, no solo extremos."
                  headerRight={
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="eyebrow">Buscar nombre</span>
                        <input
                          className="h-11 min-w-0 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground sm:min-w-72"
                          onChange={(event) => setLegislatorSearchInput(event.target.value)}
                          placeholder="Ej. Ramirez, Batres, Monreal"
                          value={legislatorSearchInput}
                        />
                      </label>
                      <label className="flex min-w-0 flex-col gap-2">
                        <span className="eyebrow">Ordenar por</span>
                        <select
                          className="h-11 min-w-0 rounded-2xl border border-border/80 bg-background/80 px-4 text-sm text-foreground sm:min-w-72"
                          onChange={(event) => {
                            if (isLegislatorSort(event.target.value)) {
                              setLegislatorSort(event.target.value);
                            }
                          }}
                          value={legislatorSort}
                        >
                          {LEGISLATOR_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  }
                  title="Legisladores"
                  variant="flat"
                >
                  {availableGroups.length > 1 ? (
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="eyebrow mr-1">Grupo</span>
                      {availableGroups.map(({ code, count }) => {
                        const isActive = selectedGroupCodes.has(code);
                        return (
                          <button
                            aria-pressed={isActive}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
                              isActive
                                ? "border-foreground/80 bg-foreground text-background"
                                : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                            }`}
                            key={code}
                            onClick={() => toggleLegislatorGroup(code)}
                            type="button"
                          >
                            <span>{code}</span>
                            <span
                              className={`tabular-nums ${isActive ? "text-background/80" : "text-muted-foreground/80"}`}
                            >
                              {formatInteger(count)}
                            </span>
                          </button>
                        );
                      })}
                      {selectedGroupCodes.size > 0 ? (
                        <button
                          className="ml-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          onClick={clearLegislatorGroups}
                          type="button"
                        >
                          Limpiar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <LegislatorsTable
                    legislators={legislators}
                    legislature={selectedLegislature}
                    loading={isLegislatorsLoading}
                    onSortChange={setLegislatorSort}
                    periodId={selectedPeriodId}
                    searchActive={Boolean(urlLegislatorSearch || selectedGroupCodes.size > 0)}
                    sort={legislatorSort}
                  />
                </Panel>
              </StaggerItem>
            </StaggerList>
          )}
        </SwappableContent>
      </div>
    </main>
  );
}

function TrendTooltip(props: {
  active?: boolean;
  label?: string;
  payload?: {
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: number | string;
    payload?: { sessionCount?: number };
  }[];
}) {
  const { active } = props;
  const { label } = props;
  const { payload } = props;

  if (!active || !payload?.length) {
    return null;
  }

  const sessionCount = Number(payload[0]?.payload?.sessionCount ?? 1);

  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">
        {sessionCount > 1 ? `${sessionCount} sesiones agregadas` : "1 sesión"}
      </p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-medium text-foreground">{entry.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PartyTooltip(props: {
  active?: boolean;
  label?: string;
  payload?: {
    color?: string;
    dataKey?: string | number;
    name?: string;
    value?: number | string;
    payload?: { totalVisible?: number };
  }[];
}) {
  const { active } = props;
  const { label } = props;
  const { payload } = props;

  if (!active || !payload?.length) {
    return null;
  }

  const totalVisible = Number(payload[0]?.payload?.totalVisible ?? 0);

  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">Total visible: {totalVisible.toFixed(1)}%</p>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-medium text-foreground">
              {Number(entry.value ?? 0).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  eyebrow,
  title,
  subtitle,
  detail,
  tone = "default",
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  detail: string;
  tone?: "default" | "primary";
  children: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-[2rem] border p-5 sm:p-6 ${
        tone === "primary" ? "surface-panel border-border/75" : "surface-soft border-border/70"
      }`}
    >
      <p className="eyebrow">{eyebrow}</p>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{detail}</p>
      <h2 className="mt-5 font-heading text-4xl leading-none text-foreground sm:mt-6 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-3 text-base font-medium text-foreground/82">{subtitle}</p>
      <p className="mt-4 max-w-[34ch] text-sm leading-6 text-muted-foreground">{children}</p>
    </article>
  );
}

function Panel({
  title,
  description,
  headerRight,
  children,
  variant = "default",
  className,
  bodyClassName,
}: {
  title: string;
  description: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "editorial" | "flat";
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`${className ?? ""} rounded-[2rem] border p-5 sm:p-6 ${
        variant === "editorial"
          ? "surface-panel border-border/80"
          : variant === "flat"
            ? "border-border/70 bg-card/75"
            : "surface-soft border-border/75"
      }`}
    >
      <div className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="font-heading text-2xl text-foreground">{title}</h2>
          {headerRight ? <div className="sm:shrink-0">{headerRight}</div> : null}
        </div>
        <p className="mt-3 max-w-none text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <span aria-hidden className="h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
      <span>{label}</span>
    </span>
  );
}

function MiniNote({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[1.4rem] border border-border/70 bg-background/72 p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  );
}

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-muted/65 ${className ?? ""}`} style={style} />
  );
}

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr_0.95fr]">
        {[0, 1, 2].map((index) => (
          <article
            className={`rounded-[2rem] border p-5 sm:p-6 ${
              index === 0 ? "surface-panel border-border/75" : "surface-soft border-border/70"
            }`}
            key={index}
          >
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-5 h-4 w-40" />
            <SkeletonBlock className="mt-6 h-12 w-32 sm:h-14" />
            <SkeletonBlock className="mt-4 h-4 w-48" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-5/6" />
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1.3fr]">
        <div className="surface-panel rounded-[2rem] border border-border/80 p-5 sm:p-6">
          <SkeletonBlock className="h-5 w-56" />
          <SkeletonBlock className="mt-3 h-3 w-3/4" />
          <div className="mt-6 flex h-72 items-end justify-between gap-3">
            {[60, 80, 50, 70, 45, 65, 55].map((height, index) => (
              <SkeletonBlock
                className="w-full rounded-t-2xl rounded-b-none"
                key={index}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
        <div className="surface-soft rounded-[2rem] border border-border/75 p-5 sm:p-6">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="mt-3 h-3 w-2/3" />
          <SkeletonBlock className="mt-6 h-72 w-full" />
        </div>
      </section>

      <div className="rounded-[2rem] border border-border/70 bg-card/75 p-5 sm:p-6">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="mt-3 h-3 w-1/2" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="flex items-center gap-4" key={index}>
              <SkeletonBlock className="h-11 w-11 rounded-2xl" />
              <SkeletonBlock className="h-4 flex-1" />
              <SkeletonBlock className="hidden h-4 w-20 sm:block" />
              <SkeletonBlock className="hidden h-4 w-16 sm:block" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyPanelMessage() {
  return (
    <div className="flex h-80 items-center justify-center text-muted-foreground">
      <div className="max-w-xs text-center">
        <p className="text-sm font-medium text-foreground/75">No hay datos disponibles</p>
        <p className="mt-2 text-xs leading-5">
          Selecciona un periodo importado para comparar participacion por grupo.
        </p>
      </div>
    </div>
  );
}
