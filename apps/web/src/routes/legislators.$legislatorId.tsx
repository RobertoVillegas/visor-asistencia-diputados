import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { api } from "../lib/api"

type DetailSearch = {
  legislature?: string
  periodId?: string
}

export const Route = createFileRoute("/legislators/$legislatorId")({
  validateSearch: (search): DetailSearch => ({
    legislature:
      typeof search.legislature === "string" ? search.legislature : undefined,
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
  component: LegislatorAliasPage,
})

function LegislatorAliasPage() {
  const navigate = useNavigate()
  const { legislatorId } = Route.useParams()
  const search = Route.useSearch()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolveAlias() {
      try {
        const summary = await api.getLegislator(legislatorId)

        if (cancelled) return

        await navigate({
          to: "/people/$personId",
          params: { personId: summary.personId },
          search,
          replace: true,
        })
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "No se pudo resolver la persona."
          )
        }
      }
    }

    void resolveAlias()

    return () => {
      cancelled = true
    }
  }, [legislatorId, navigate, search])

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex min-h-svh w-full max-w-3xl items-center justify-center px-4 py-8">
        {error ? (
          <section className="rounded-3xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </section>
        ) : (
          <section className="surface-soft rounded-[2rem] border border-border/75 p-6 text-sm text-muted-foreground">
            Redirigiendo al perfil canónico…
          </section>
        )}
      </div>
    </main>
  )
}
