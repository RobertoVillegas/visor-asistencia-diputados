import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import {
  api,
  type ReconciliationDetails,
  type SessionInspectionResponse,
} from "../lib/api"
import { authClient } from "../lib/auth-client"
import { formatDate, formatSessionType } from "../lib/format"

function ReconciliationSection({
  reconciliation,
}: {
  reconciliation: SessionInspectionResponse["reconciliation"]
}) {
  if (!reconciliation) {
    return (
      <section className="rounded-[2rem] border border-border bg-card p-6">
        <h2 className="font-heading text-2xl text-foreground">
          Conciliación asistencias / inasistencias
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No hay datos de conciliación para esta sesión.
        </p>
      </section>
    )
  }

  const details = reconciliation.details as ReconciliationDetails | undefined
  const matches = reconciliation.matches === "true"
  const missing = details?.missingFromAttendance ?? []
  const extra = details?.extraInAttendance ?? []
  const groupDiffs = details?.groupDiffs ?? []
  const hasDiffs =
    missing.length > 0 || extra.length > 0 || groupDiffs.length > 0

  return (
    <section className="rounded-[2rem] border border-border bg-card p-6">
      <h2 className="font-heading text-2xl text-foreground">
        Conciliación asistencias / inasistencias
      </h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div
          className={`rounded-2xl border p-4 ${matches ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Estado
          </p>
          <p
            className={`mt-2 font-heading text-xl ${matches ? "text-emerald-800" : "text-rose-800"}`}
          >
            {matches ? "Coincide" : "Con diferencias"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Inasistencias (attendance)
          </p>
          <p className="mt-2 font-heading text-xl text-foreground">
            {String(reconciliation.attendanceAbsenceCount ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Inasistencias (PDF)
          </p>
          <p className="mt-2 font-heading text-xl text-foreground">
            {String(reconciliation.absencePdfCount ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Diferencias
          </p>
          <p className="mt-2 font-heading text-xl text-foreground">
            {(reconciliation.groupDiffCount as number) ?? 0}
          </p>
        </div>
      </div>

      {hasDiffs ? (
        <div className="mt-6 space-y-6">
          {missing.length > 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <h3 className="text-sm font-semibold text-rose-900">
                Faltan en asistencias ({missing.length})
              </h3>
              <p className="text-xs text-rose-700">
                Están en el PDF de inasistencias pero no en el documento de
                asistencias
              </p>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {missing.map((name) => (
                  <li className="text-sm text-rose-800" key={name}>
                    • {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {extra.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">
                Extra en asistencias ({extra.length})
              </h3>
              <p className="text-xs text-amber-700">
                Están en el documento de asistencias pero no en el PDF de
                inasistencias
              </p>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {extra.map((name) => (
                  <li className="text-sm text-amber-800" key={name}>
                    • {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {groupDiffs.length > 0 ? (
            <div className="rounded-2xl border border-border bg-background p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Diferencias por grupo
              </h3>
              <div className="mt-3 overflow-auto rounded-xl border border-border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/70 text-xs tracking-[0.18em] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">Grupo</th>
                      <th className="px-3 py-2 text-right">Attendance</th>
                      <th className="px-3 py-2 text-right">PDF</th>
                      <th className="px-3 py-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupDiffs.map((diff) => (
                      <tr
                        className={`border-t border-border/70 ${diff.difference !== 0 ? "bg-rose-50/50" : ""}`}
                        key={diff.groupCode}
                      >
                        <td className="px-3 py-2 font-medium">
                          {diff.groupCode}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {diff.attendanceCount}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {diff.absenceCount}
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${diff.difference !== 0 ? "text-rose-700" : "text-emerald-700"}`}
                        >
                          {diff.difference > 0 ? "+" : ""}
                          {diff.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No hay diferencias registradas.
        </p>
      )}
    </section>
  )
}

export const Route = createFileRoute("/admin/sessions/$sessionId")({
  component: AdminSessionInspectionPage,
})

function AdminSessionInspectionPage() {
  const { sessionId } = Route.useParams()
  const { data: sessionData, isPending } = authClient.useSession()
  const [payload, setPayload] = useState<SessionInspectionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionData?.session) return

    let cancelled = false

    async function load() {
      try {
        const next = await api.getSessionInspection(sessionId)
        if (!cancelled) {
          setPayload(next)
          setError(null)
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudo cargar la sesión."
          )
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [sessionData?.session, sessionId])

  if (isPending) {
    return (
      <main className="min-h-svh bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
          Cargando sesión…
        </div>
      </main>
    )
  }

  if (!sessionData?.session) {
    return (
      <main className="min-h-svh bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
          Inicia sesión en /admin para ver esta vista.
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="text-sm font-semibold text-foreground underline"
            to="/admin"
          >
            ← Volver a administración
          </Link>
        </div>

        {error ? (
          <section className="rounded-3xl border border-border bg-card p-4 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        {payload ? (
          <>
            <section className="rounded-[2rem] border border-border bg-card p-6">
              <p className="text-xs font-semibold tracking-[0.28em] text-muted-foreground uppercase">
                Inspección
              </p>
              <h1 className="mt-3 font-heading text-3xl text-foreground">
                {payload.session.title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {payload.session.sessionDate
                  ? formatDate(String(payload.session.sessionDate))
                  : "Sin fecha"}{" "}
                ·{" "}
                {formatSessionType(
                  String(payload.session.sessionType ?? "unknown")
                )}
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-foreground">Gaceta:</span>{" "}
                  <a
                    className="text-sky-700 underline"
                    href={String(payload.session.sessionPageUrl)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir sesión en gaceta
                  </a>
                </p>
                <p>
                  <span className="font-semibold text-foreground">Slug:</span>{" "}
                  {String(payload.session.sourceSlug)}
                </p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="font-heading text-2xl text-foreground">
                Documentos y snapshots
              </h2>
              <div className="mt-4 space-y-4">
                {payload.documents.map((doc) => (
                  <article
                    className="rounded-2xl border border-border/70 p-4"
                    key={String(doc.id)}
                  >
                    <p className="font-semibold text-foreground">
                      {String(doc.kind)}
                    </p>
                    <a
                      className="text-sm text-sky-700 underline"
                      href={String(doc.url)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {String(doc.url)}
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Páginas:{" "}
                      {doc.pageCount != null ? String(doc.pageCount) : "—"} ·
                      Extraído:{" "}
                      {doc.extractedAt
                        ? formatDate(String(doc.extractedAt))
                        : "—"}
                    </p>
                  </article>
                ))}
              </div>

              <h3 className="mt-6 font-heading text-xl text-foreground">
                Snapshots recientes
              </h3>
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(payload.snapshots.slice(0, 8), null, 2)}
              </pre>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="font-heading text-2xl text-foreground">
                Parse runs
              </h2>
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(payload.parseRuns.slice(0, 8), null, 2)}
              </pre>
            </section>

            <ReconciliationSection reconciliation={payload.reconciliation} />

            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="font-heading text-2xl text-foreground">
                Vista previa de texto (asistencias)
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Primeros 8k caracteres del PDF extraído localmente.
              </p>
              <pre className="mt-4 max-h-80 overflow-auto rounded-2xl border border-border bg-muted/40 p-4 text-xs whitespace-pre-wrap text-foreground">
                {payload.rawTextPreview ?? "Sin texto en caché todavía."}
              </pre>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="font-heading text-2xl text-foreground">
                Filas parseadas ({payload.attendancePreview.length})
              </h2>
              <div className="mt-4 overflow-auto rounded-2xl border border-border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/70 text-xs tracking-[0.2em] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Grupo</th>
                      <th className="px-3 py-2">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.attendancePreview.map((row) => (
                      <tr
                        className="border-t border-border/70"
                        key={String(row.id)}
                      >
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {String(row.rowNumber ?? "")}
                        </td>
                        <td className="px-3 py-2">{String(row.rawName)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {row.groupCode ? String(row.groupCode) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {String(row.status)}
                          {row.rawStatus ? ` (${String(row.rawStatus)})` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6">
              <h2 className="font-heading text-2xl text-foreground">
                Anomalías de ingestión
              </h2>
              <div className="mt-4 space-y-3">
                {payload.anomalies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin anomalías registradas para esta sesión.
                  </p>
                ) : (
                  payload.anomalies.map((anomaly) => (
                    <article
                      className="rounded-2xl border border-border/70 p-4"
                      key={String(anomaly.id)}
                    >
                      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                        {String(anomaly.kind)}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        {String(anomaly.message)}
                      </p>
                      {anomaly.snippet ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {String(anomaly.snippet)}
                        </p>
                      ) : null}
                      {anomaly.sourceUrl ? (
                        <a
                          className="mt-2 inline-block text-xs text-sky-700 underline"
                          href={String(anomaly.sourceUrl)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver PDF
                        </a>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Cargando inspección…</p>
        )}
      </div>
    </main>
  )
}
