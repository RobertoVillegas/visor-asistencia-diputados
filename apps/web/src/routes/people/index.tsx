import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FadeIn, StaggerItem, StaggerList } from "../../components/reveal";
import { api } from "../../lib/api";

export const Route = createFileRoute("/people/")({
  component: PeoplePage,
});

function PeoplePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const directoryQuery = useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      api.listPeople({
        page,
        pageSize: 24,
        q: search || undefined,
      }),
    queryKey: ["people-directory", { page, pageSize: 24, q: search || undefined }],
  });

  const directory = directoryQuery.data ?? null;
  const error = (directoryQuery.error as Error | null)?.message ?? null;
  const isInitialLoading = directoryQuery.isPending;
  const isFetching = directoryQuery.isFetching;

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <FadeIn>
          <div>
            <Link
              className="inline-flex h-10 items-center rounded-full border border-border bg-background/80 px-4 text-xs font-semibold tracking-[0.18em] text-foreground uppercase transition-colors hover:bg-muted"
              to="/"
            >
              Volver al dashboard
            </Link>
          </div>
        </FadeIn>

        <FadeIn>
          <section className="surface-panel overflow-hidden rounded-[2.2rem] border border-border/80 p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <p className="eyebrow">Directorio publico</p>
                <h1 className="mt-4 max-w-3xl font-heading text-4xl leading-tight text-foreground sm:text-5xl sm:leading-none lg:text-6xl">
                  Diputadas y diputados
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                  Fichas legislativas para cruzar nombres, grupo parlamentario, retrato y contexto
                  biografico con los datos publicos del tablero.
                </p>
              </div>

              <div className="surface-soft rounded-[1.8rem] border border-border/75 p-4">
                <label className="flex flex-col gap-2">
                  <span className="eyebrow">Buscar por nombre</span>
                  <input
                    className="h-12 w-full rounded-2xl border border-border bg-background/80 px-4 text-sm outline-none"
                    onChange={(event) => {
                      setPage(1);
                      setSearch(event.target.value);
                    }}
                    placeholder="Buscar por nombre"
                    value={search}
                  />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="eyebrow">Vista</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Galeria editorial con lectura rapida del perfil.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="eyebrow">Contenido</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Foto, grupo, legislatura y bio breve cuando exista.
                    </p>
                  </div>
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

        {isInitialLoading || !directory ? (
          <section className="surface-soft rounded-[2rem] border border-border/75 p-6 text-sm text-muted-foreground">
            Cargando directorio…
          </section>
        ) : (
          <>
            <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {directory.items.map((person) => (
                <StaggerItem key={person.id}>
                  <Link
                    className="surface-soft block h-full rounded-[1.9rem] border border-border/75 p-4 transition-transform hover:-translate-y-0.5 hover:border-border/95"
                    params={{ personId: person.id }}
                    to="/people/$personId"
                  >
                    <article className="flex h-full flex-col">
                      {person.imageUrl ? (
                        <img
                          alt={person.fullName}
                          className="aspect-[4/5] w-full rounded-[1.35rem] object-cover"
                          src={person.imageUrl}
                        />
                      ) : (
                        <div className="flex aspect-[4/5] items-center justify-center rounded-[1.35rem] bg-muted text-xs tracking-[0.3em] text-muted-foreground uppercase">
                          Sin foto
                        </div>
                      )}

                      <div className="mt-4 flex-1">
                        <p className="eyebrow">{person.groupCode ?? "Sin grupo"}</p>
                        <h2 className="mt-3 text-xl font-semibold text-foreground">
                          {person.fullName}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {person.groupName ?? "Sin grupo"} · {person.legislature}
                        </p>
                        <p className="mt-4 line-clamp-5 text-sm leading-6 text-foreground/80">
                          {person.bio ?? "Perfil en construcción."}
                        </p>
                      </div>

                      <span className="mt-5 inline-flex text-xs font-semibold tracking-[0.22em] text-foreground uppercase underline-offset-4">
                        Ver perfil
                      </span>
                    </article>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>

            <section className="mt-2 flex flex-col gap-3 rounded-[1.8rem] border border-border/75 bg-background/80 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                Página {directory.page} · {directory.total} perfiles
                {isFetching ? " · actualizando…" : ""}
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-full border border-border bg-background/70 px-3 py-1.5 disabled:opacity-40 sm:flex-none"
                  disabled={directory.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="flex-1 rounded-full border border-border bg-background/70 px-3 py-1.5 disabled:opacity-40 sm:flex-none"
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
  );
}
