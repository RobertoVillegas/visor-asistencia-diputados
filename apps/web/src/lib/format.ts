export function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX").format(value)
}

export function formatDate(value?: string | null) {
  if (!value) return "Sin fecha"

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(new Date(value))
}

export function formatCompactDate(value?: string | null) {
  if (!value) return "N/D"

  return new Intl.DateTimeFormat("es-MX", {
    month: "short",
    day: "numeric",
  }).format(new Date(value))
}

export function formatSessionType(value?: string | null) {
  if (!value) return "Sin tipo"

  const labels: Record<string, string> = {
    ordinary: "Ordinaria",
    permanent: "Permanente",
    special: "Especial",
    vote: "Votación",
    unknown: "Sin tipo",
  }

  return (
    labels[value] ??
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

export function formatStatusLabel(value: string) {
  const labels: Record<string, string> = {
    attendance: "Asistencia",
    cedula: "Cédula",
    justified_absence: "Inasistencia justificada",
    absence: "Inasistencia",
    official_commission: "Comisión oficial",
    board_leave: "Permiso de Mesa Directiva",
    not_present_in_votes: "No presente en votaciones",
    unknown: "Desconocido",
  }

  return (
    labels[value] ??
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}
