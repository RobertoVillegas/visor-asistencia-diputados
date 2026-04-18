import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import type { LegislatorAttendanceRow, LegislatorSummary, LegislatorTrend } from "../../lib/api";
import { FadeIn, StaggerItem, StaggerList, SwappableContent } from "../../components/reveal";
import {
  formatCompactDate,
  formatDate,
  formatInteger,
  formatSessionType,
  formatStatusLabel,
} from "../../lib/format";

interface DetailSearch {
  legislature?: string;
  periodId?: string;
}

export const Route = createFileRoute("/people/$personId")({
  component: PersonDetailPage,
  validateSearch: (search): DetailSearch => ({
    legislature: typeof search.legislature === "string" ? search.legislature : undefined,
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
});

function PersonDetailPage() {
  const { personId } = Route.useParams();
  const search = Route.useSearch();
  const [summary, setSummary] = useState<LegislatorSummary | null>(null);
  const [attendance, setAttendance] = useState<LegislatorAttendanceRow[]>([]);
  const [trend, setTrend] = useState<LegislatorTrend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPerson() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextSummary, nextAttendance, nextTrend] = await Promise.all([
          api.getPerson(personId, {
            legislature: search.legislature,
          }),
          api.getPersonAttendance(personId, {
            legislature: search.legislature,
          }),
          api.getPersonTrend(personId, {
            legislature: search.legislature,
            periodId: search.periodId,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setSummary(nextSummary);
        setAttendance(nextAttendance);
        setTrend(nextTrend);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudo cargar la ficha de la persona.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPerson();

    return () => {
      cancelled = true;
    };
  }, [personId, search.legislature, search.periodId]);

  const trendCells = useMemo(() => {
    const attendanceBySessionId = new Map(attendance.map((row) => [row.sessionId, row]));

    return (trend?.points ?? []).map((point) => {
      const session = attendanceBySessionId.get(point.sessionId);

      return {
        date: point.sessionDate,
        label: formatCompactDate(point.sessionDate),
        sessionId: point.sessionId,
        sessionPageUrl: session?.sessionPageUrl ?? null,
        sessionType: session?.sessionType ?? point.sessionType,
        status: point.status,
        title: session?.title ?? point.title,
      };
    });
  }, [attendance, trend]);

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <FadeIn>
          <div>
            <Link
              className="inline-flex h-10 items-center rounded-full border border-border bg-background/80 px-4 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-colors hover:bg-muted"
              search={{
                legislature: search.legislature,
                periodId: search.periodId,
              }}
              to="/"
            >
              Volver al dashboard
            </Link>
          </div>
        </FadeIn>

        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : null}

        <SwappableContent contentKey={`${personId}:${summary?.fullName ?? "loading"}`}>
          {isLoading || !summary || !trend ? (
            <section className="surface-soft rounded-[2rem] border border-border/75 p-6 text-sm text-muted-foreground">
              Cargando ficha de la persona…
            </section>
          ) : (
            <StaggerList className="flex flex-col gap-6">
              <StaggerItem>
                <section className="surface-panel rounded-[2.2rem] border border-border/80 p-6 sm:p-8">
                  <div className="grid gap-6 lg:grid-cols-[0.38fr_1fr]">
                    <div>
                      {summary.imageUrl ? (
                        <img
                          alt={summary.fullName}
                          className="aspect-[4/5] w-full max-w-64 rounded-[1.6rem] object-cover"
                          src={summary.imageUrl}
                        />
                      ) : (
                        <div className="flex aspect-[4/5] w-full max-w-64 items-center justify-center rounded-[1.6rem] bg-muted text-xs tracking-[0.3em] text-muted-foreground uppercase">
                          Sin foto
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="eyebrow">Perfil legislativo</p>
                      <h1 className="mt-4 font-heading text-4xl leading-none text-foreground sm:text-6xl">
                        {summary.fullName}
                      </h1>
                      <p className="mt-4 text-sm text-muted-foreground">
                        {summary.groupName ?? "Sin grupo"} · {summary.legislature}
                      </p>

                      {summary.relatedLegislatures.length > 1 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {summary.relatedLegislatures.map((item) => (
                            <Link
                              className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold tracking-[0.16em] uppercase ${
                                item.isCurrent
                                  ? "border-border bg-foreground text-background"
                                  : "border-border bg-background/75 text-foreground"
                              }`}
                              key={item.id}
                              params={{ personId: summary.personId }}
                              search={{
                                legislature: item.legislature,
                                periodId: item.isCurrent ? search.periodId : undefined,
                              }}
                              to="/people/$personId"
                            >
                              {item.legislature}
                            </Link>
                          ))}
                        </div>
                      ) : null}

                      {summary.bio ? (
                        <p className="mt-6 max-w-3xl text-sm leading-7 text-foreground/82">
                          {summary.bio}
                        </p>
                      ) : null}

                      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InfoStat
                          label="Sesiones"
                          value={formatInteger(summary.sessionsMentioned)}
                        />
                        <InfoStat
                          label="Asistencias"
                          value={formatInteger(summary.attendanceCount)}
                        />
                        <InfoStat
                          label="Inasistencias"
                          value={formatInteger(summary.absenceCount)}
                        />
                        <InfoStat
                          label="Justificadas"
                          value={formatInteger(summary.justifiedAbsenceCount)}
                        />
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InfoStat label="Cédula" value={formatInteger(summary.cedulaCount)} />
                        <InfoStat
                          label="Comisión"
                          value={formatInteger(summary.officialCommissionCount)}
                        />
                        <InfoStat label="Licencia" value={formatInteger(summary.boardLeaveCount)} />
                        <InfoStat
                          label="Sin voto"
                          value={formatInteger(summary.notPresentInVotesCount)}
                        />
                      </div>

                      <p className="mt-5 max-w-3xl text-sm leading-6 text-muted-foreground">
                        El total de sesiones puede incluir cédula, comisión oficial, licencia de
                        mesa directiva o no presencia en votaciones.
                      </p>
                    </div>
                  </div>
                </section>
              </StaggerItem>

              <StaggerItem>
                <section className="grid gap-6 lg:grid-cols-[0.95fr_1.15fr]">
                  <section className="surface-soft rounded-[2rem] border border-border/75 p-6">
                    <h2 className="font-heading text-2xl text-foreground">Asistencia por sesión</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Cada cuadro representa una sesión en orden cronológico.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-1.5">
                      {trendCells.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Sin sesiones registradas en este periodo.
                        </p>
                      ) : (
                        trendCells.map((cell) => (
                          <SessionTrendCell
                            key={cell.sessionId}
                            label={cell.label}
                            sessionPageUrl={cell.sessionPageUrl}
                            sessionType={cell.sessionType}
                            status={cell.status}
                            title={cell.title}
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
                  </section>

                  <section className="rounded-[2rem] border border-border/75 bg-card/80 p-6">
                    <h2 className="font-heading text-2xl text-foreground">Historial</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Registro por sesión con el estatus normalizado del PDF oficial.
                    </p>

                    <div className="mt-5 max-h-[28rem] overflow-auto rounded-[1.6rem] border border-border/70">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-muted/60 text-xs tracking-[0.24em] text-muted-foreground uppercase">
                          <tr>
                            <th className="px-4 py-3 font-medium">Fecha</th>
                            <th className="px-4 py-3 font-medium">Estatus</th>
                            <th className="px-4 py-3 font-medium">Sesión</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendance.map((row) => (
                            <tr
                              className="border-t border-border/60 align-top"
                              key={row.attendanceRecordId}
                            >
                              <td className="px-4 py-3">
                                <p className="font-semibold">{formatDate(row.sessionDate)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatSessionType(row.sessionType)}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase ${statusClassName(row.status)}`}
                                >
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
              </StaggerItem>
            </StaggerList>
          )}
        </SwappableContent>
      </div>
    </main>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[1.35rem] border border-border/70 bg-background/75 p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-heading text-3xl text-foreground">{value}</p>
    </article>
  );
}

function statusClassName(status: string) {
  if (status === "attendance") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "justified_absence") {
    return "bg-amber-100 text-amber-900";
  }
  if (status === "absence") {
    return "bg-rose-100 text-rose-900";
  }
  return "bg-slate-200 text-slate-800";
}

function cellClassName(status: string) {
  if (
    status === "attendance" ||
    status === "cedula" ||
    status === "official_commission" ||
    status === "board_leave"
  ) {
    return "bg-emerald-500";
  }
  if (status === "justified_absence") {
    return "bg-amber-400";
  }
  if (status === "absence") {
    return "bg-rose-500";
  }
  return "bg-slate-300";
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      <span className={`h-3 w-3 rounded-sm ${color}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

function SessionTrendCell({
  label,
  sessionPageUrl,
  sessionType,
  status,
  title,
}: {
  label: string;
  sessionPageUrl: string | null;
  sessionType: string;
  status: string;
  title: string;
}) {
  const content = (
    <>
      <span
        className={`h-5 w-5 rounded-sm transition-transform group-hover:scale-110 ${cellClassName(status)}`}
      />
      <span className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 w-56 -translate-x-1/2 rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs text-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <span className="block font-semibold">{label}</span>
        <span className="mt-1 block text-muted-foreground">
          {formatSessionType(sessionType)} · {formatStatusLabel(status)}
        </span>
        <span className="mt-1 block text-muted-foreground">{title}</span>
        {sessionPageUrl ? (
          <span className="mt-2 block font-semibold text-foreground">Abrir fuente oficial</span>
        ) : null}
      </span>
    </>
  );

  if (sessionPageUrl) {
    return (
      <a
        className="group relative inline-flex"
        href={sessionPageUrl}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return <span className="group relative inline-flex">{content}</span>;
}
