import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { api, type PeopleDirectoryResponse } from "../lib/api"

export const Route = createFileRoute("/people")({
  component: PeoplePage,
})

function PeoplePage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [directory, setDirectory] = useState<PeopleDirectoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPeople() {
      setIsLoading(true)
      setError(null)

      try {
        const nextDirectory = await api.listPeople({
          q: search || undefined,
          page,
          pageSize: 24,
        })

        if (cancelled) return
        setDirectory(nextDirectory)
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el directorio.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPeople()

    return () => {
      cancelled = true
    }
  }, [page, search])

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Directorio</p>
          <h1 className="mt-3 font-heading text-5xl text-foreground">Diputadas y diputados</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Catálogo público de perfiles legislativos. Aquí puedes enriquecer foto y bio desde administración y
            consultarlos públicamente.
          </p>
          <input
            className="mt-5 h-11 w-full max-w-md rounded-2xl border border-border bg-card px-4 text-sm"
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
            placeholder="Buscar por nombre"
            value={search}
          />
        </section>

        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : null}

        {isLoading || !directory ? (
          <section className="rounded-3xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Cargando directorio…
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {directory.items.map((person) => (
                <article
                  className="rounded-[1.75rem] border border-border bg-background/90 p-4 shadow-sm"
                  key={person.id}
                >
                  {person.imageUrl ? (
                    <img
                      alt={person.fullName}
                      className="aspect-[4/5] w-full rounded-[1.25rem] object-cover"
                      src={person.imageUrl}
                    />
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center rounded-[1.25rem] bg-muted text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Sin foto
                    </div>
                  )}

                  <h2 className="mt-4 text-lg font-semibold text-foreground">{person.fullName}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {person.groupName ?? "Sin grupo"} · {person.legislature}
                  </p>
                  <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground/80">
                    {person.bio ?? "Perfil en construcción."}
                  </p>

                  <Link
                    className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.22em] text-foreground underline-offset-4 hover:underline"
                    params={{ legislatorId: person.id }}
                    to="/legislators/$legislatorId"
                  >
                    Ver perfil
                  </Link>
                </article>
              ))}
            </section>

            <section className="flex items-center justify-between rounded-3xl border border-border bg-background/80 px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                Página {directory.page} · {directory.total} perfiles
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-full border border-border px-3 py-1 disabled:opacity-40"
                  disabled={directory.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="rounded-full border border-border px-3 py-1 disabled:opacity-40"
                  disabled={directory.page * directory.pageSize >= directory.total}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
