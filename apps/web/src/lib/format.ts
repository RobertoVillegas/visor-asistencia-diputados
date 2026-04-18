export function formatPercent(value: number) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatCompactDate(value?: string | null) {
  if (!value) {
    return "N/D";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatSessionType(value?: string | null) {
  if (!value) {
    return "Sin tipo";
  }

  const labels: Record<string, string> = {
    ordinary: "Ordinaria",
    permanent: "Permanente",
    special: "Especial",
    unknown: "Sin tipo",
    vote: "Votación",
  };

  return (
    labels[value] ??
    value.replaceAll("_", " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function formatStatusLabel(value: string) {
  const labels: Record<string, string> = {
    absence: "Inasistencia",
    attendance: "Asistencia",
    board_leave: "Permiso de Mesa Directiva",
    cedula: "Cédula",
    justified_absence: "Inasistencia justificada",
    not_present_in_votes: "No presente en votaciones",
    official_commission: "Comisión oficial",
    unknown: "Desconocido",
  };

  return (
    labels[value] ??
    value.replaceAll("_", " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase())
  );
}
