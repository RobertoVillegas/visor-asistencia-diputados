import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { LegislatorAnalyticsRow } from "../lib/api";
import { formatInteger, formatPercent } from "../lib/format";

export type LegislatorTableSort =
  | "name"
  | "sessions_mentioned"
  | "attendance_count"
  | "justified_absence_count"
  | "absence_count"
  | "participation_ratio"
  | "participation_ratio_asc";

interface LegislatorsTableProps {
  legislators: LegislatorAnalyticsRow[];
  legislature?: string;
  loading?: boolean;
  periodId?: string;
  sort?: LegislatorTableSort;
  onSortChange?: (sort: LegislatorTableSort) => void;
  searchActive?: boolean;
}

const COLUMN_SORTS: Record<string, { default: LegislatorTableSort; toggle?: LegislatorTableSort }> =
  {
    absenceCount: { default: "absence_count" },
    attendanceCount: { default: "attendance_count" },
    fullName: { default: "name" },
    justifiedAbsenceCount: { default: "justified_absence_count" },
    participacion: { default: "participation_ratio", toggle: "participation_ratio_asc" },
    sessionsMentioned: { default: "sessions_mentioned" },
  };

function nextSortFor(columnId: string, current?: LegislatorTableSort): LegislatorTableSort | null {
  const mapping = COLUMN_SORTS[columnId];
  if (!mapping) {
    return null;
  }
  if (mapping.toggle && (current === mapping.default || current === mapping.toggle)) {
    return current === mapping.default ? mapping.toggle : mapping.default;
  }
  return mapping.default;
}

function sortIndicator(columnId: string, current?: LegislatorTableSort): string {
  const mapping = COLUMN_SORTS[columnId];
  if (!mapping || !current) {
    return "";
  }
  if (current === mapping.default) {
    return mapping.default === "name" ? " ▲" : " ▼";
  }
  if (mapping.toggle && current === mapping.toggle) {
    return " ▲";
  }
  return "";
}

function getOthersCount(row: LegislatorAnalyticsRow) {
  return (
    row.cedulaCount + row.officialCommissionCount + row.boardLeaveCount + row.notPresentInVotesCount
  );
}

function getParticipationRatio(row: LegislatorAnalyticsRow) {
  if (row.sessionsMentioned <= 0) {
    return 0;
  }
  return (
    (row.attendanceCount + row.cedulaCount + row.officialCommissionCount + row.boardLeaveCount) /
    row.sessionsMentioned
  );
}

const OTHERS_TOOLTIP = "Cédula + Comisión oficial + Mesa Directiva + Sin voto";

export function LegislatorsTable({
  legislators,
  legislature,
  loading = false,
  onSortChange,
  periodId,
  searchActive = false,
  sort,
}: LegislatorsTableProps) {
  const navigate = useNavigate();
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 15,
  });

  const columns = useMemo<ColumnDef<LegislatorAnalyticsRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            {row.original.imageUrl ? (
              <img
                alt=""
                className="h-11 w-11 rounded-2xl object-cover"
                src={row.original.imageUrl}
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                {getInitials(row.original.fullName)}
              </div>
            )}
            <div className="min-w-0">
              <Link
                className="font-semibold text-foreground underline-offset-4 hover:underline"
                onClick={(event) => event.stopPropagation()}
                params={{ personId: row.original.personId }}
                search={{ legislature, periodId }}
                to="/people/$personId"
              >
                {row.original.fullName}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.original.groupCode ?? "Sin grupo"}
              </p>
            </div>
          </div>
        ),
        header: () => `Diputada o diputado${sortIndicator("fullName", sort)}`,
      },
      {
        accessorKey: "sessionsMentioned",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatInteger(row.original.sessionsMentioned)}</span>
        ),
        header: () => `Sesiones${sortIndicator("sessionsMentioned", sort)}`,
      },
      {
        accessorKey: "attendanceCount",
        cell: ({ row }) => (
          <span className="text-emerald-700 tabular-nums">
            {formatInteger(row.original.attendanceCount)}
          </span>
        ),
        header: () => `Asist.${sortIndicator("attendanceCount", sort)}`,
      },
      {
        accessorKey: "justifiedAbsenceCount",
        cell: ({ row }) => (
          <span className="text-amber-600 tabular-nums">
            {formatInteger(row.original.justifiedAbsenceCount)}
          </span>
        ),
        header: () => `Justif.${sortIndicator("justifiedAbsenceCount", sort)}`,
      },
      {
        accessorKey: "absenceCount",
        cell: ({ row }) => (
          <span className="text-rose-600 tabular-nums">
            {formatInteger(row.original.absenceCount)}
          </span>
        ),
        header: () => `Inasist.${sortIndicator("absenceCount", sort)}`,
      },
      {
        cell: ({ row }) => (
          <span className="text-muted-foreground tabular-nums" title={OTHERS_TOOLTIP}>
            {formatInteger(getOthersCount(row.original))}
          </span>
        ),
        header: () => (
          <span title={OTHERS_TOOLTIP} className="cursor-help">
            Otros
          </span>
        ),
        id: "otros",
      },
      {
        cell: ({ row }) => {
          const participacionRatio = getParticipationRatio(row.original);
          return (
            <div className="flex items-center gap-3">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${participacionRatio * 100}%` }}
                />
              </div>
              <span className="w-14 text-right text-sm font-medium text-emerald-700">
                {formatPercent(participacionRatio)}
              </span>
            </div>
          );
        },
        header: () => `Participación${sortIndicator("participacion", sort)}`,
        id: "participacion",
      },
    ],
    [legislature, periodId, sort],
  );

  const table = useReactTable({
    columns,
    data: legislators,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  });

  const visibleRows = table.getRowModel().rows;

  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-border/75 bg-card/60">
      {loading ? (
        <div className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
          Actualizando listado…
        </div>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/55 text-xs tracking-[0.22em] text-muted-foreground uppercase">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const next = nextSortFor(header.column.id, sort);
                  const isSortable = Boolean(next && onSortChange);
                  return (
                    <th
                      aria-sort={
                        COLUMN_SORTS[header.column.id]
                          ? sort === COLUMN_SORTS[header.column.id]?.default
                            ? "descending"
                            : sort === COLUMN_SORTS[header.column.id]?.toggle
                              ? "ascending"
                              : "none"
                          : undefined
                      }
                      className={`px-4 py-4 font-medium ${
                        isSortable
                          ? "cursor-pointer select-none transition-colors hover:text-foreground"
                          : ""
                      }`}
                      key={header.id}
                      onClick={isSortable && next ? () => onSortChange?.(next) : undefined}
                      onKeyDown={
                        isSortable && next
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSortChange?.(next);
                              }
                            }
                          : undefined
                      }
                      tabIndex={isSortable ? 0 : undefined}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                  colSpan={columns.length}
                >
                  <EmptyMessage searchActive={searchActive} />
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const goToProfile = () =>
                  navigate({
                    params: { personId: row.original.personId },
                    search: { legislature, periodId },
                    to: "/people/$personId",
                  });

                return (
                  <tr
                    className="cursor-pointer border-t border-border/55 align-middle transition-colors hover:bg-background/65 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
                    key={row.id}
                    onClick={goToProfile}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        goToProfile();
                      }
                    }}
                    role="link"
                    tabIndex={0}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td className="px-4 py-4" key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 p-3 md:hidden">
        {visibleRows.length === 0 ? (
          <li className="rounded-2xl border border-border/60 bg-background/60 p-6 text-center text-sm text-muted-foreground">
            <EmptyMessage searchActive={searchActive} />
          </li>
        ) : (
          visibleRows.map((row) => (
            <li key={row.id}>
              <LegislatorCard
                legislator={row.original}
                legislature={legislature}
                periodId={periodId}
              />
            </li>
          ))
        )}
      </ul>

      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Página {pagination.pageIndex + 1} de {table.getPageCount() || 1}
        </p>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-full border border-border bg-background/70 px-3 py-1.5 disabled:opacity-40 sm:flex-none"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            type="button"
          >
            Anterior
          </button>
          <button
            className="flex-1 rounded-full border border-border bg-background/70 px-3 py-1.5 disabled:opacity-40 sm:flex-none"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

function LegislatorCard({
  legislator,
  legislature,
  periodId,
}: {
  legislator: LegislatorAnalyticsRow;
  legislature?: string;
  periodId?: string;
}) {
  const navigate = useNavigate();
  const goToProfile = () =>
    navigate({
      params: { personId: legislator.personId },
      search: { legislature, periodId },
      to: "/people/$personId",
    });

  const participation = getParticipationRatio(legislator);
  const others = getOthersCount(legislator);

  return (
    <button
      className="flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-background/65 p-4 text-left transition-colors hover:bg-background/85 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground"
      onClick={goToProfile}
      type="button"
    >
      <div className="flex items-center gap-3">
        {legislator.imageUrl ? (
          <img alt="" className="h-12 w-12 rounded-2xl object-cover" src={legislator.imageUrl} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {getInitials(legislator.fullName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{legislator.fullName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {legislator.groupCode ?? "Sin grupo"}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-5 gap-2 text-center">
        <CardStat label="Ses." value={formatInteger(legislator.sessionsMentioned)} />
        <CardStat label="Asist." tone="emerald" value={formatInteger(legislator.attendanceCount)} />
        <CardStat
          label="Justif."
          tone="amber"
          value={formatInteger(legislator.justifiedAbsenceCount)}
        />
        <CardStat label="Inasist." tone="rose" value={formatInteger(legislator.absenceCount)} />
        <CardStat label="Otros" value={formatInteger(others)} />
      </dl>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${participation * 100}%` }}
          />
        </div>
        <span className="w-14 text-right text-sm font-semibold text-emerald-700">
          {formatPercent(participation)}
        </span>
      </div>
    </button>
  );
}

function CardStat({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "emerald" | "amber" | "rose";
  value: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "rose"
          ? "text-rose-600"
          : "text-foreground";

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={`font-semibold tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  );
}

function EmptyMessage({ searchActive }: { searchActive: boolean }) {
  if (searchActive) {
    return (
      <div className="space-y-1">
        <p className="font-medium text-foreground/80">
          Sin coincidencias para los filtros actuales
        </p>
        <p className="text-xs leading-5">
          Ajusta el texto de búsqueda o quita los grupos seleccionados para ver más resultados.
        </p>
      </div>
    );
  }
  return (
    <p>
      Aún no hay legisladores procesados para este periodo. Vuelve cuando se haya importado el
      contenido oficial.
    </p>
  );
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2);
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`;
}
