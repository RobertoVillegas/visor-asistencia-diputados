import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"

import type { LegislatorAnalyticsRow } from "../lib/api"
import { formatInteger, formatPercent } from "../lib/format"

type LegislatorsTableProps = {
  legislators: LegislatorAnalyticsRow[]
  legislature?: string
  loading?: boolean
  periodId?: string
}

export function LegislatorsTable({
  legislators,
  legislature,
  loading = false,
  periodId,
}: LegislatorsTableProps) {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 15,
  })

  const columns = useMemo<ColumnDef<LegislatorAnalyticsRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Diputada o diputado",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              params={{ legislatorId: row.original.id }}
              search={{ legislature, periodId }}
              to="/legislators/$legislatorId"
            >
              {row.original.fullName}
            </Link>
            <p className="text-xs text-muted-foreground">
              {row.original.groupCode ?? "Sin grupo"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "sessionsMentioned",
        header: "Sesiones",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatInteger(row.original.sessionsMentioned)}
          </span>
        ),
      },
      {
        accessorKey: "attendanceCount",
        header: "Asist.",
        cell: ({ row }) => (
          <span className="text-emerald-700 tabular-nums">
            {formatInteger(row.original.attendanceCount)}
          </span>
        ),
      },
      {
        accessorKey: "justifiedAbsenceCount",
        header: "Justif.",
        cell: ({ row }) => (
          <span className="text-amber-600 tabular-nums">
            {formatInteger(row.original.justifiedAbsenceCount)}
          </span>
        ),
      },
      {
        accessorKey: "absenceCount",
        header: "Inasist.",
        cell: ({ row }) => (
          <span className="text-rose-600 tabular-nums">
            {formatInteger(row.original.absenceCount)}
          </span>
        ),
      },
      {
        id: "participacion",
        header: "Participación",
        cell: ({ row }) => {
          const participacionRatio =
            row.original.sessionsMentioned > 0
              ? (row.original.attendanceCount +
                  row.original.cedulaCount +
                  row.original.officialCommissionCount) /
                row.original.sessionsMentioned
              : 0
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
          )
        },
      },
    ],
    [legislature, periodId]
  )

  const table = useReactTable({
    data: legislators,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    state: {
      pagination,
    },
  })

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card/70">
      {loading ? (
        <div className="border-b border-border/70 px-4 py-3 text-xs text-muted-foreground">
          Actualizando listado…
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/70 text-xs tracking-[0.24em] text-muted-foreground uppercase">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th className="px-4 py-3 font-medium" key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                className="border-t border-border/70 align-top transition-colors hover:bg-muted/40"
                key={row.id}
              >
                {row.getVisibleCells().map((cell) => (
                  <td className="px-4 py-3" key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
        <p>
          Página {pagination.pageIndex + 1} de {table.getPageCount() || 1}
        </p>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-border px-3 py-1 disabled:opacity-40"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            type="button"
          >
            Anterior
          </button>
          <button
            className="rounded-full border border-border px-3 py-1 disabled:opacity-40"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            type="button"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
