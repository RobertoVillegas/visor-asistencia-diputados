import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import {
  api,
  type LegislatorAttendanceRow,
  type LegislatorSummary,
  type LegislatorTrend,
} from "../lib/api"
import {
  formatCompactDate,
  formatDate,
  formatInteger,
  formatSessionType,
  formatStatusLabel,
} from "../lib/format"

type DetailSearch = {
  legislature?: string
  periodId?: string
}

export const Route = createFileRoute("/legislators/$legislatorId")({
  validateSearch: (search): DetailSearch => ({
    legislature: typeof search.legislature === "string" ? search.legislature : undefined,
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
  component: LegislatorDetailPage,
})

function LegislatorDetailPage() {
  const { legislatorId } = Route.useParams()
  const search = Route.useSearch()
  const [summary, setSummary] = useState<LegislatorSummary | null>(null)
  const [attendance, setAttendance] = useState<LegislatorAttendanceRow[]>([])
  const [trend, setTrend] = useState<LegislatorTrend | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadLegislator() {
      setIsLoading(true)
      setError(null)

      try {
        const [nextSummary, nextAttendance, nextTrend] = await Promise.all([
          api.getLegislator(legislatorId),
          api.getLegislatorAttendance(legislatorId),
          api.getLegislatorTrend(legislatorId, {
            legislature: search.legislature,
            periodId: search.periodId,
          }),
        ])

        if (cancelled) return

        setSummary(nextSummary)
        setAttendance(nextAttendance)
        setTrend(nextTrend)
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar la ficha del legislador.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadLegislator()

    return () => {
      cancelled = true
    }
  }, [legislatorId, search.legislature, search.periodId])

  const trendCells = useMemo(
    () =>
      (trend?.points ?? []).map((point) => ({
        sessionId: point.sessionId,
        date: point.sessionDate,
        label: formatCompactDate(point.sessionDate),
        status: point.status,
      })),
    [trend],
  )

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <Link
            className="inline-flex h-10 items-center rounded-none border border-border px-4 text-xs font-semibold uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-muted"
            search={{ legislature: search.legislature, periodId: search.periodId }}
            to="/"
          >
            Volver al dashboard
          </Link>
        </div>

        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : null}

        {isLoading || !summary || !trend ? (
          <section className="rounded-3xl border border-border bg-card/80 p-6 text-sm text-muted-foreground">
            Cargando ficha del legislador…
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] border border-border bg-background/90 p-6 shadow-[0_18px_70px_rgba(84,58,28,0.07)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Perfil legislativo
              </p>
              <h1 className="mt-3 font-heading text-4xl leading-none text-foreground sm:text-5xl">
                {summary.fullName}
              </h1>
              <p className="mt-4 text-sm text-muted-foreground">
                {summary.groupName ?? "Sin grupo"} · {summary.legislature}
              </p>

              {summary.imageUrl ? (
                <img
                  alt={summary.fullName}
                  className="mt-6 aspect-[4/5] w-48 rounded-[1.5rem] object-cover shadow-sm"
                  src={summary.imageUrl}
                />
              ) : null}

              {summary.bio ? (
                <p className="mt-6 max-w-3xl text-sm leading-7 text-foreground/80">{summary.bio}</p>
              ) : null}

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <InfoStat label="Sesiones" value={formatInteger(summary.sessionsMentioned)} />
                <InfoStat label="Asistencias" value={formatInteger(summary.attendanceCount)} />
                <InfoStat label="Cédula" value={formatInteger(summary.cedulaCount)} />
                <InfoStat label="Justificadas" value={formatInteger(summary.justifiedAbsenceCount)} />
                <InfoStat label="Inasistencias" value={formatInteger(summary.absenceCount)} />
                <InfoStat label="Comisión" value={formatInteger(summary.officialCommissionCount)} />
                <InfoStat label="Licencia" value={formatInteger(summary.boardLeaveCount)} />
                <InfoStat label="Sin voto" value={formatInteger(summary.notPresentInVotesCount)} />
              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                El total de sesiones puede incluir estatus distintos de asistencia o inasistencia, como{" "}
                <span className="font-medium text-foreground/85">cédula</span>, comisión oficial, licencia de mesa
                directiva o no presencia en votaciones.
              </p>
            </section>

            <section className="grid gap-6 lg:grid-cols-[1.05fr_1.15fr]">
              <section className="rounded-[2rem] border border-border bg-card p-6">
                <h2 className="font-heading text-2xl text-foreground">Asistencia por sesión</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cada cuadro es una sesión en orden cronológico. El color refleja el estatus normalizado del PDF
                  oficial.
                </p>

                <div className="mt-6 flex flex-wrap gap-1.5">
                  {trendCells.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin sesiones registradas en este periodo.</p>
                  ) : (
                    trendCells.map((cell) => (
                      <span
                        className={`h-5 w-5 rounded-sm ${cellClassName(cell.status)}`}
                        key={cell.sessionId}
                        title={`${cell.label} · ${formatStatusLabel(cell.status)}`}
                      />
                    ))
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <LegendDot color="bg-emerald-500" label="Asistencia" />
                  <LegendDot color="bg-amber-400" label="Justificada" />
                  <LegendDot color="bg-rose-500" label="Inasistencia" />
                  <LegendDot color="bg-slate-300" label="Otro" />
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  Las inasistencias justificadas cuentan como ausencia para los porcentajes, pero se distinguen en
                  ámbar para auditoría.
                </p>
              </section>

              <section className="rounded-[2rem] border border-border bg-background/90 p-6 shadow-sm">
                <h2 className="font-heading text-2xl text-foreground">Historial</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Registro por sesión con el estatus normalizado proveniente del PDF oficial.
                </p>

                <div className="mt-5 max-h-[28rem] overflow-auto rounded-3xl border border-border/70">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/70 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">Estatus</th>
                        <th className="px-4 py-3 font-medium">Sesión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((row) => (
                        <tr className="border-t border-border/70 align-top" key={row.attendanceRecordId}>
                          <td className="px-4 py-3">
                            <p className="font-semibold">{formatDate(row.sessionDate)}</p>
                            <p className="text-xs text-muted-foreground">{formatSessionType(row.sessionType)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusClassName(row.status)}`}>
                              {formatStatusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{row.title}</p>
                            <a
                              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                              href={row.sessionPageUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Ver fuente oficial
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function InfoStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <article className="rounded-3xl border border-border/70 bg-card/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-heading text-foreground">{value}</p>
    </article>
  )
}

function statusClassName(status: string) {
  if (status === "attendance") return "bg-emerald-100 text-emerald-800"
  if (status === "justified_absence") return "bg-amber-100 text-amber-900"
  if (status === "absence") return "bg-rose-100 text-rose-900"
  return "bg-slate-200 text-slate-800"
}

function cellClassName(status: string) {
  if (status === "attendance" || status === "cedula" || status === "official_commission" || status === "board_leave") {
    return "bg-emerald-500"
  }
  if (status === "justified_absence") return "bg-amber-400"
  if (status === "absence") return "bg-rose-500"
  return "bg-slate-300"
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <span className={`h-3 w-3 rounded-sm ${color}`} aria-hidden />
      <span>{label}</span>
    </span>
  )
}
