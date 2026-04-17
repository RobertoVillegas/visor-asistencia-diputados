import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import {
  api,
  type IngestAnomalyRow,
  type JobQueueItem,
  type JobQueueResponse,
  type PeopleDirectoryResponse,
  type ProcessAllPeriodsResult,
  type ProcessPeriodResult,
  type RemotePeriod,
  type SessionQualityRow,
} from "../lib/api"
import { authClient } from "../lib/auth-client"
import { formatDate, formatSessionType } from "../lib/format"

export const Route = createFileRoute("/admin")({
  component: AdminPage,
})

type AdminPeriod = RemotePeriod & {
  storedPeriodId?: string
  isImported: boolean
}

function AdminPage() {
  const { data: sessionData, isPending, refetch } = authClient.useSession()
  const [periods, setPeriods] = useState<AdminPeriod[]>([])
  const [selectedPeriodPageUrl, setSelectedPeriodPageUrl] = useState("")
  const [periodPageUrl, setPeriodPageUrl] = useState(
    "https://gaceta.diputados.gob.mx/gp66_Asis2.html"
  )
  const [selectedLegislature, setSelectedLegislature] = useState("LXVI")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [result, setResult] = useState<
    ProcessPeriodResult | ProcessAllPeriodsResult | JobQueueItem | null
  >(null)
  const [jobs, setJobs] = useState<JobQueueResponse | null>(null)
  const [sessionQuality, setSessionQuality] = useState<SessionQualityRow[]>([])
  const [ingestAnomalies, setIngestAnomalies] = useState<IngestAnomalyRow[]>([])
  const [anomalyKind, setAnomalyKind] = useState("")
  const [peopleDirectory, setPeopleDirectory] =
    useState<PeopleDirectoryResponse | null>(null)
  const [peopleSearch, setPeopleSearch] = useState("")
  const [peoplePage, setPeoplePage] = useState(1)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [profileDraft, setProfileDraft] = useState({
    imageUrl: "",
    bio: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<{
    deleted: number
    groups: Array<{ code: string; name: string; legislature: string }>
  } | null>(null)
  const [forceParseAll, setForceParseAll] = useState(false)

  const availableLegislatures = useMemo(
    () => Array.from(new Set(periods.map((period) => period.legislature))),
    [periods]
  )

  useEffect(() => {
    let cancelled = false

    async function loadPeriods() {
      try {
        const [remotePeriods, storedPeriods] = await Promise.all([
          api.listPeriods(),
          api.listStoredPeriods(),
        ])
        if (cancelled) return

        const storedByUrl = new Map(
          storedPeriods.map((period) => [period.periodPageUrl, period])
        )
        const nextPeriods = remotePeriods.map((period) => {
          const stored = storedByUrl.get(period.periodPageUrl)

          return {
            ...period,
            storedPeriodId: stored?.id,
            isImported: Boolean(stored),
          }
        })

        setPeriods(nextPeriods)
        setSelectedPeriodPageUrl(
          (current) => current || nextPeriods[0]?.periodPageUrl || ""
        )
        setSelectedLegislature(
          (current) => current || nextPeriods[0]?.legislature || "LXVI"
        )
      } catch (caughtError) {
        if (!cancelled) {
          setStatus(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudieron cargar los periodos."
          )
        }
      }
    }

    void loadPeriods()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleEmailAuth() {
    setIsSubmitting(true)
    setStatus(null)

    try {
      const signInResponse = await authClient.signIn.email({
        email,
        password,
      })

      if (signInResponse.error) {
        const signUpResponse = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0],
        })

        if (signUpResponse.error) {
          throw new Error(
            signInResponse.error.message ||
              signUpResponse.error.message ||
              "No se pudo iniciar sesión."
          )
        }
      }

      await refetch()
      setStatus("Sesión iniciada correctamente.")
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Falló la autenticación."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    setIsSubmitting(true)
    setStatus(null)

    try {
      const response = await authClient.signOut()

      if (response.error) {
        throw new Error(
          response.error.message || "No se pudo cerrar la sesión."
        )
      }

      await refetch()
      setResult(null)
      setStatus("Sesión cerrada.")
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo cerrar la sesión."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function runProcess(body: {
    periodId?: string
    periodPageUrl?: string
    forceParseAll?: boolean
  }) {
    setIsSubmitting(true)
    setStatus(null)

    try {
      const nextResult = await api.enqueueProcessPeriodJob(body)
      setResult(nextResult)
      setStatus("Job encolado correctamente.")
      const [remotePeriods, storedPeriods] = await Promise.all([
        api.listPeriods(),
        api.listStoredPeriods(),
      ])
      const storedByUrl = new Map(
        storedPeriods.map((period) => [period.periodPageUrl, period])
      )
      setPeriods(
        remotePeriods.map((period) => ({
          ...period,
          storedPeriodId: storedByUrl.get(period.periodPageUrl)?.id,
          isImported: storedByUrl.has(period.periodPageUrl),
        }))
      )
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "El procesamiento falló."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function runProcessAll(body: { legislature?: string }) {
    setIsSubmitting(true)
    setStatus(null)

    try {
      const nextResult = await api.enqueueProcessAllPeriodsJob({
        ...body,
        forceParseAll,
      })
      setResult(nextResult)
      setStatus("Job masivo encolado correctamente.")
      const [remotePeriods, storedPeriods] = await Promise.all([
        api.listPeriods(),
        api.listStoredPeriods(),
      ])
      const storedByUrl = new Map(
        storedPeriods.map((period) => [period.periodPageUrl, period])
      )
      setPeriods(
        remotePeriods.map((period) => ({
          ...period,
          storedPeriodId: storedByUrl.get(period.periodPageUrl)?.id,
          isImported: storedByUrl.has(period.periodPageUrl),
        }))
      )
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "El procesamiento masivo falló."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const isAuthenticated = Boolean(sessionData?.session)
  const selectedPeriod = periods.find(
    (period) => period.periodPageUrl === selectedPeriodPageUrl
  )
  const visiblePeriods = periods.filter(
    (period) => period.legislature === selectedLegislature
  )
  const selectedPerson =
    peopleDirectory?.items.find((item) => item.id === selectedPersonId) ?? null
  const suspiciousSessions = sessionQuality.filter(
    (session) =>
      session.attendanceRecordCount < 400 ||
      session.reconciliationStatus !== "matched" ||
      session.parseStatus !== "parsed" ||
      session.latestSnapshotStatus === "failed"
  )

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    async function loadAdminData() {
      try {
        const [nextJobs, nextSessionQuality, nextAnomalies] = await Promise.all(
          [
            api.listJobs(),
            api.listSessionQuality({ legislature: selectedLegislature }),
            api.listIngestAnomalies({
              legislature: selectedLegislature,
              kind: anomalyKind || undefined,
              limit: 150,
            }),
          ]
        )

        if (cancelled) return
        setJobs(nextJobs)
        setSessionQuality(nextSessionQuality)
        setIngestAnomalies(nextAnomalies)
      } catch (caughtError) {
        if (!cancelled) {
          setStatus(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudo cargar la auditoría."
          )
        }
      }
    }

    void loadAdminData()
    const interval = setInterval(() => {
      void loadAdminData()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isAuthenticated, selectedLegislature, anomalyKind])

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    async function loadPeople() {
      try {
        const nextPeople = await api.listPeople({
          legislature: selectedLegislature,
          q: peopleSearch || undefined,
          page: peoplePage,
          pageSize: 8,
        })

        if (cancelled) return

        setPeopleDirectory(nextPeople)
        setSelectedPersonId(
          (current) => current ?? nextPeople.items[0]?.id ?? null
        )
      } catch (caughtError) {
        if (!cancelled) {
          setStatus(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudo cargar el catálogo de personas."
          )
        }
      }
    }

    void loadPeople()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, peoplePage, peopleSearch, selectedLegislature])

  useEffect(() => {
    if (!selectedPerson) return

    setProfileDraft({
      imageUrl: selectedPerson.imageUrl ?? "",
      bio: selectedPerson.bio ?? "",
    })
  }, [selectedPerson])

  async function handleSaveProfile() {
    if (!selectedPersonId) return

    setIsSubmitting(true)
    setStatus(null)

    try {
      await api.updateLegislatorProfile(selectedPersonId, {
        imageUrl: profileDraft.imageUrl || null,
        bio: profileDraft.bio || null,
      })
      setStatus("Perfil actualizado.")
      const nextPeople = await api.listPeople({
        legislature: selectedLegislature,
        q: peopleSearch || undefined,
        page: peoplePage,
        pageSize: 8,
      })
      setPeopleDirectory(nextPeople)
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo guardar el perfil."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCleanupInvalidGroups() {
    setIsSubmitting(true)
    setStatus(null)
    setCleanupResult(null)

    try {
      const result = await api.cleanupInvalidGroups({
        legislature: selectedLegislature,
      })
      setCleanupResult(result)
      setStatus(
        `Limpieza completada: ${result.deleted} grupos inválidos eliminados.`
      )
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "No se pudo ejecutar la limpieza."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-muted-foreground uppercase">
              Ruta interna
            </p>
            <h1 className="mt-3 font-heading text-4xl leading-none text-foreground">
              Administración
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Esta ruta no se muestra en la navegación pública. Sirve para
              autenticar administradores y disparar el pipeline de
              descubrimiento, parseo y conciliación.
            </p>
          </div>

          {status ? (
            <div className="mt-6 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
              {status}
            </div>
          ) : null}

          {!isAuthenticated ? (
            <div className="mt-8 border-t border-border pt-8">
              <h2 className="font-heading text-xl text-foreground">Acceso</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Solo los correos admin configurados en el backend pueden crear
                cuenta. Contacta al administrador para obtener acceso.
              </p>
              <div className="mt-6 flex max-w-md flex-col gap-4">
                <label className="flex flex-col gap-2 text-sm">
                  Email
                  <input
                    className="h-11 rounded-2xl border border-border bg-background px-4"
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    value={email}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Password
                  <input
                    className="h-11 rounded-2xl border border-border bg-background px-4"
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    value={password}
                  />
                </label>
              </div>
              <Button
                className="mt-6"
                disabled={isPending || isSubmitting}
                onClick={() => void handleEmailAuth()}
              >
                Entrar o crear acceso inicial
              </Button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">
                  Sesión activa
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {sessionData?.user.email}
                </p>
              </div>
              <Button
                disabled={isSubmitting}
                onClick={() => void handleSignOut()}
                variant="outline"
              >
                Cerrar sesión
              </Button>
            </div>
          )}
        </section>

        {isAuthenticated ? (
          <>
            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Procesar periodos publicados
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Usa la lista oficial completa. Si el periodo no está importado,
                se descubre y procesa; si ya está importado, se refresca.
              </p>
              <label className="mt-5 flex flex-col gap-2 text-sm">
                Legislatura
                <select
                  className="h-11 rounded-2xl border border-border bg-card px-4"
                  onChange={(event) => {
                    const legislature = event.target.value
                    const nextPeriod = periods.find(
                      (period) => period.legislature === legislature
                    )
                    setSelectedLegislature(legislature)
                    setSelectedPeriodPageUrl(nextPeriod?.periodPageUrl ?? "")
                  }}
                  value={selectedLegislature}
                >
                  {availableLegislatures.map((legislature) => (
                    <option key={legislature} value={legislature}>
                      {legislature}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-5 flex flex-col gap-2 text-sm">
                Periodo
                <select
                  className="h-11 rounded-2xl border border-border bg-card px-4"
                  onChange={(event) =>
                    setSelectedPeriodPageUrl(event.target.value)
                  }
                  value={selectedPeriodPageUrl}
                >
                  {visiblePeriods.map((period) => (
                    <option
                      key={period.periodPageUrl}
                      value={period.periodPageUrl}
                    >
                      {period.label}
                      {period.isImported ? "" : " · pendiente"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-3 text-sm text-muted-foreground">
                Estado actual:{" "}
                <span className="font-semibold text-foreground">
                  {selectedPeriod?.isImported ? "importado" : "no importado"}
                </span>
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  disabled={!selectedPeriodPageUrl || isSubmitting}
                  onClick={() =>
                    void runProcess(
                      selectedPeriod?.storedPeriodId
                        ? { periodId: selectedPeriod.storedPeriodId }
                        : { periodPageUrl: selectedPeriodPageUrl }
                    )
                  }
                >
                  Procesar periodo
                </Button>
                <Button
                  disabled={!selectedPeriodPageUrl || isSubmitting}
                  onClick={() =>
                    void runProcess(
                      selectedPeriod?.storedPeriodId
                        ? {
                            periodId: selectedPeriod.storedPeriodId,
                            forceParseAll: true,
                          }
                        : {
                            periodPageUrl: selectedPeriodPageUrl,
                            forceParseAll: true,
                          }
                    )
                  }
                  variant="outline"
                >
                  Forzar reparseo
                </Button>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Descubrir desde URL
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Úsalo para cargar una nueva página anual de asistencia de la
                legislatura.
              </p>
              <label className="mt-5 flex flex-col gap-2 text-sm">
                URL del periodo
                <input
                  className="h-11 rounded-2xl border border-border bg-card px-4"
                  onChange={(event) => setPeriodPageUrl(event.target.value)}
                  value={periodPageUrl}
                />
              </label>
              <Button
                className="mt-5"
                disabled={!periodPageUrl || isSubmitting}
                onClick={() => void runProcess({ periodPageUrl })}
              >
                Descubrir y procesar
              </Button>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Procesamiento masivo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Recorre todos los periodos publicados o todos los de una
                legislatura. Esto es la base para correr un cronjob después.
              </p>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  Legislatura
                  <select
                    className="h-11 rounded-2xl border border-border bg-card px-4"
                    onChange={(event) =>
                      setSelectedLegislature(event.target.value)
                    }
                    value={selectedLegislature}
                  >
                    {availableLegislatures.map((legislature) => (
                      <option key={legislature} value={legislature}>
                        {legislature}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  disabled={isSubmitting}
                  onClick={() =>
                    void runProcessAll({ legislature: selectedLegislature })
                  }
                >
                  Procesar legislatura completa
                </Button>
                <Button
                  disabled={isSubmitting}
                  onClick={() => void runProcessAll({})}
                  variant="outline"
                >
                  Procesar todos los periodos
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={forceParseAll}
                    onChange={(e) => setForceParseAll(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span
                    className={
                      forceParseAll
                        ? "font-medium text-amber-700"
                        : "text-muted-foreground"
                    }
                  >
                    Forzar reparseo (ignorar caché de PDFs)
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Cola y jobs
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Estado en tiempo real del worker, los jobs encolados y el
                resultado de cada corrida.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <MiniStat
                  label="Pendientes"
                  value={String(jobs?.stats.pending ?? 0)}
                />
                <MiniStat
                  label="Corriendo"
                  value={String(jobs?.stats.running ?? 0)}
                />
                <MiniStat
                  label="Completados"
                  value={String(jobs?.stats.completed ?? 0)}
                />
                <MiniStat
                  label="Fallidos"
                  value={String(jobs?.stats.failed ?? 0)}
                />
              </div>

              <div className="mt-5 max-h-[28rem] overflow-auto rounded-3xl border border-border/70">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted/70 text-xs tracking-[0.24em] text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Job</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium">Progreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs?.jobs.map((job) => (
                      <tr
                        className="border-t border-border/70 align-top"
                        key={job.id}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold">{job.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.createdByEmail ?? "system"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(job.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase ${jobStatusClassName(job.status)}`}
                          >
                            {job.status}
                          </span>
                          {job.errorMessage ? (
                            <p className="mt-2 text-xs text-rose-700">
                              {job.errorMessage}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(job.progress ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Sesiones sospechosas
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Detecta sesiones con pocos registros, conciliación pendiente o
                mismatch.
              </p>
              <div className="mt-5 max-h-[28rem] space-y-3 overflow-auto">
                {suspiciousSessions.slice(0, 24).map((session) => (
                  <article
                    className="rounded-2xl border border-border/70 bg-card/70 p-4"
                    key={session.sessionId}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">
                          {formatDate(session.sessionDate)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSessionType(session.sessionType)}
                        </p>
                      </div>
                      <Link
                        className="text-xs font-semibold text-sky-800 underline"
                        from="/admin"
                        params={{ sessionId: session.sessionId }}
                        to="/admin/sessions/$sessionId"
                      >
                        Inspeccionar
                      </Link>
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {translateQualityStatus(session.reconciliationStatus)} ·
                      registros {session.attendanceRecordCount}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Parseo: {translateParseStatus(session.parseStatus)} ·
                      difs: {session.groupDiffCount}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-heading text-2xl text-foreground">
                    Anomalías de ingestión
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Advertencias del parseo: estatus o grupos desconocidos,
                    parser compacto, etc.
                  </p>
                </div>
                <label className="flex max-w-md flex-col gap-2 text-sm">
                  Tipo
                  <select
                    className="h-11 rounded-2xl border border-border bg-background px-4"
                    onChange={(event) => setAnomalyKind(event.target.value)}
                    value={anomalyKind}
                  >
                    <option value="">Todos</option>
                    <option value="unknown_status">Estatus desconocido</option>
                    <option value="unknown_group">Grupo desconocido</option>
                    <option value="compressed_format">Parser compacto</option>
                  </select>
                </label>
              </div>
              <div className="mt-5 max-h-[28rem] space-y-3 overflow-auto">
                {ingestAnomalies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin anomalías recientes.
                  </p>
                ) : (
                  ingestAnomalies.map((anomaly) => (
                    <article
                      className="rounded-2xl border border-border/70 bg-background/80 p-4"
                      key={anomaly.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                          {anomaly.kind}
                        </p>
                        <Link
                          className="text-xs font-semibold text-sky-800 underline"
                          from="/admin"
                          params={{ sessionId: anomaly.sessionId }}
                          to="/admin/sessions/$sessionId"
                        >
                          Ver sesión
                        </Link>
                      </div>
                      <p className="mt-2 text-sm text-foreground">
                        {anomaly.message}
                      </p>
                      {anomaly.snippet ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {anomaly.snippet}
                        </p>
                      ) : null}
                      {anomaly.sourceUrl ? (
                        <a
                          className="mt-2 inline-block text-xs text-sky-700 underline"
                          href={anomaly.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir PDF
                        </a>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Limpieza de datos
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Elimina grupos parlamentarios inválidos creados por errores de
                parseo (nombres de personas, códigos largos, etc.).
              </p>
              <div className="mt-5">
                <Button
                  disabled={isSubmitting}
                  onClick={() => void handleCleanupInvalidGroups()}
                  variant="outline"
                >
                  Limpiar grupos inválidos ({selectedLegislature})
                </Button>
              </div>
              {cleanupResult ? (
                <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium">
                    {cleanupResult.deleted} grupos eliminados:
                  </p>
                  {cleanupResult.groups.length > 0 ? (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
                      {cleanupResult.groups.map((group) => (
                        <li
                          key={`${group.legislature}-${group.code}`}
                          className="text-muted-foreground"
                        >
                          {group.code} ({group.legislature})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ninguno
                    </p>
                  )}
                </div>
              ) : null}
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
              <h2 className="font-heading text-2xl text-foreground">
                Perfiles públicos
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Enriquecimiento manual de imagen y bio para el directorio
                público.
              </p>

              <div className="mt-5 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
                <div>
                  <input
                    className="h-11 w-full rounded-2xl border border-border bg-card px-4 text-sm"
                    onChange={(event) => {
                      setPeoplePage(1)
                      setPeopleSearch(event.target.value)
                    }}
                    placeholder="Buscar persona"
                    value={peopleSearch}
                  />

                  <div className="mt-4 max-h-[30rem] space-y-3 overflow-auto">
                    {peopleDirectory?.items.map((person) => (
                      <button
                        className={`block w-full rounded-2xl border p-4 text-left ${person.id === selectedPersonId ? "border-foreground bg-card" : "border-border bg-background"}`}
                        key={person.id}
                        onClick={() => setSelectedPersonId(person.id)}
                        type="button"
                      >
                        <p className="font-semibold text-foreground">
                          {person.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {person.groupName ?? "Sin grupo"} ·{" "}
                          {person.legislature}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedPerson ? (
                    <>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedPerson.fullName}
                      </h3>
                      <label className="flex flex-col gap-2 text-sm">
                        URL de imagen
                        <input
                          className="h-11 rounded-2xl border border-border bg-card px-4"
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              imageUrl: event.target.value,
                            }))
                          }
                          value={profileDraft.imageUrl}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-sm">
                        Bio
                        <textarea
                          className="min-h-48 rounded-2xl border border-border bg-card px-4 py-3"
                          onChange={(event) =>
                            setProfileDraft((current) => ({
                              ...current,
                              bio: event.target.value,
                            }))
                          }
                          value={profileDraft.bio}
                        />
                      </label>
                      <Button
                        disabled={isSubmitting}
                        onClick={() => void handleSaveProfile()}
                      >
                        Guardar perfil
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Selecciona una persona.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {result ? (
              <section className="rounded-[2rem] border border-border bg-slate-950 p-0 shadow-sm">
                <pre className="overflow-x-auto p-5 text-xs leading-6 text-slate-100">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border bg-card/70 p-3">
      <p className="text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-heading text-2xl text-foreground">{value}</p>
    </article>
  )
}

function jobStatusClassName(status: JobQueueItem["status"]) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800"
  if (status === "failed") return "bg-rose-100 text-rose-900"
  if (status === "running") return "bg-sky-100 text-sky-900"
  return "bg-amber-100 text-amber-900"
}

function translateQualityStatus(
  status: SessionQualityRow["reconciliationStatus"]
) {
  if (status === "matched") return "conciliada"
  if (status === "mismatched") return "con diferencias"
  if (status === "not_reconciled") return "pendiente"
  return "sin PDF de inasistencias"
}

function translateParseStatus(status: SessionQualityRow["parseStatus"]) {
  if (status === "parsed") return "parseada"
  if (status === "discovered") return "descubierta"
  return "sin documento de asistencia"
}
