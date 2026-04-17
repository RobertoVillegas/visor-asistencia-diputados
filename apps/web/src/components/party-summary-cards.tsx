import { formatInteger, formatPercent } from "../lib/format"
import type { PartyAnalyticsRow } from "../lib/api"

type PartySummaryCardsProps = {
  parties: PartyAnalyticsRow[]
}

export function PartySummaryCards({ parties }: PartySummaryCardsProps) {
  if (parties.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p className="text-sm">No hay datos disponibles</p>
        <p className="mt-1 text-xs">Selecciona un periodo importado</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {parties.map((party) => {
        const participacionRatio =
          party.totalCount > 0
            ? (party.attendanceCount +
                party.cedulaCount +
                party.officialCommissionCount) /
              party.totalCount
            : 0
        const inasistenciaRatio =
          party.totalCount > 0
            ? (party.absenceCount +
                party.boardLeaveCount +
                party.notPresentInVotesCount) /
              party.totalCount
            : 0
        return (
          <div
            key={party.groupCode}
            className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border/80"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {party.groupCode}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {party.groupName}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {formatInteger(party.sessionCount)} sesiones
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${participacionRatio * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-sm font-medium text-emerald-700">
                  {formatPercent(participacionRatio)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-rose-500"
                    style={{ width: `${inasistenciaRatio * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-sm font-medium text-rose-700">
                  {formatPercent(inasistenciaRatio)}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-center text-xs">
              <div>
                <p className="font-semibold text-emerald-700">
                  {formatInteger(party.attendanceCount)}
                </p>
                <p className="text-muted-foreground">Asistencia</p>
              </div>
              <div>
                <p className="font-semibold text-amber-600">
                  {formatInteger(party.justifiedAbsenceCount)}
                </p>
                <p className="text-muted-foreground">Justificada</p>
              </div>
              <div>
                <p className="font-semibold text-rose-600">
                  {formatInteger(party.absenceCount)}
                </p>
                <p className="text-muted-foreground">Inasistencia</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
