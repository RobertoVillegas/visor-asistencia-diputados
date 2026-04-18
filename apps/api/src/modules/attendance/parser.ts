export type ParsedAttendanceStatus =
  | "attendance"
  | "cedula"
  | "justified_absence"
  | "absence"
  | "official_commission"
  | "board_leave"
  | "not_present_in_votes"
  | "unknown";

export interface ParsedAttendanceRecord {
  rowNumber: number;
  pageNumber: number;
  rawName: string;
  normalizedName: string;
  groupName: string;
  groupCode: string;
  status: ParsedAttendanceStatus;
  rawStatus: string;
}

export interface ParsedGroupSummary {
  groupName: string;
  groupCode: string;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
  totalCount: number;
}

export interface ParsedAttendanceDocument {
  records: ParsedAttendanceRecord[];
  summaries: ParsedGroupSummary[];
  parserPath: "standard" | "compressed";
}

const headerLinePattern =
  /^(SECRETARIA GENERAL|REPORTE DE ASISTENCIA|SESI[ÓO]N|Primer Periodo|Segundo Periodo|Tercer Periodo|Comisi[óo]n Permanente|lunes,|martes,|mi[ée]rcoles,|jueves,|viernes,|s[áa]bado,|domingo,|P[áa]gina \d+)/i;
const permanentReportPattern = /REPORTE PRELIMINAR DE ASISTENCIA\s+COMISI[ÓO]N PERMANENTE/i;

const groupCodeMap = new Map<string, { code: string; name: string }>([
  [
    "movimiento regeneracion nacional",
    { code: "MORENA", name: "Movimiento Regeneración Nacional" },
  ],
  ["partido accion nacional", { code: "PAN", name: "Partido Acción Nacional" }],
  [
    "partido verde ecologista de mexico",
    { code: "PVEM", name: "Partido Verde Ecologista de México" },
  ],
  ["partido del trabajo", { code: "PT", name: "Partido del Trabajo" }],
  [
    "partido revolucionario institucional",
    { code: "PRI", name: "Partido Revolucionario Institucional" },
  ],
  [
    "partido de la revolucion democratica",
    { code: "PRD", name: "Partido de la Revolución Democrática" },
  ],
  ["movimiento ciudadano", { code: "MC", name: "Movimiento Ciudadano" }],
  ["independiente", { code: "IND", name: "Independiente" }],
  ["independientes", { code: "IND", name: "Independiente" }],
]);

export const KNOWN_GROUP_CODES = new Set(
  new Set([...groupCodeMap.values()].map((group) => group.code)),
);

const statusMap = new Map<string, ParsedAttendanceStatus>([
  ["ASISTENCIA", "attendance"],
  ["CÉDULA", "cedula"],
  ["CEDULA", "cedula"],
  ["JUSTIFICADA", "justified_absence"],
  ["INASISTENCIA", "absence"],
  ["COMISIÓN OFICIAL", "official_commission"],
  ["COMISION OFICIAL", "official_commission"],
  ["OFICIAL COMISIÓN", "official_commission"],
  ["OFICIAL COMISION", "official_commission"],
  ["PERMISO MESA DIRECTIVA", "board_leave"],
  ["NO PRESENTES EN VOTACIONES", "not_present_in_votes"],
  ["NO PRESENTE EN VOTACIONES", "not_present_in_votes"],
]);

const orderedStatuses = [...statusMap.keys()].toSorted((a, b) => b.length - a.length);
const knownGroupNames = [
  ...new Set([...groupCodeMap.values()].map((group) => group.name)),
].toSorted((a, b) => b.length - a.length);

function stripAccents(value: string): string {
  return value.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
}

export function normalizeName(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function normalizeGroupKey(value: string): string {
  return normalizeName(value);
}

function mapGroup(groupName: string) {
  const normalized = normalizeGroupKey(groupName);
  return (
    groupCodeMap.get(normalized) ?? {
      code: normalized.toUpperCase(),
      name: groupName,
    }
  );
}

function mapStatus(rawStatus: string): ParsedAttendanceStatus {
  return statusMap.get(stripAccents(rawStatus).toUpperCase()) ?? "unknown";
}

function isHeaderLine(line: string): boolean {
  return headerLinePattern.test(line);
}

function escapeRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseRecordLine(line: string) {
  for (const status of orderedStatuses) {
    const suffixPattern = new RegExp(
      `\\s+${status.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    );
    const match = line.match(suffixPattern);

    if (!match) {
      continue;
    }

    const beforeStatus = line.slice(0, match.index).trim();
    const rowMatch = beforeStatus.match(/^(\d+)\s+(?:\.\s+)?(.+)$/);
    if (!rowMatch) {
      return null;
    }

    return {
      rawName: rowMatch[2].trim(),
      rawStatus: match[0].trim(),
      rowNumber: Number(rowMatch[1]),
    };
  }

  return null;
}

function summarizeRecords(records: ParsedAttendanceRecord[]): ParsedGroupSummary[] {
  const grouped = new Map<string, ParsedGroupSummary>();

  for (const record of records) {
    const existing = grouped.get(record.groupCode) ?? {
      absenceCount: 0,
      attendanceCount: 0,
      boardLeaveCount: 0,
      cedulaCount: 0,
      groupCode: record.groupCode,
      groupName: record.groupName,
      justifiedAbsenceCount: 0,
      notPresentInVotesCount: 0,
      officialCommissionCount: 0,
      totalCount: 0,
    };

    existing.totalCount += 1;
    if (record.status === "attendance") {
      existing.attendanceCount += 1;
    }
    if (record.status === "cedula") {
      existing.cedulaCount += 1;
    }
    if (record.status === "justified_absence") {
      existing.justifiedAbsenceCount += 1;
    }
    if (record.status === "absence") {
      existing.absenceCount += 1;
    }
    if (record.status === "official_commission") {
      existing.officialCommissionCount += 1;
    }
    if (record.status === "board_leave") {
      existing.boardLeaveCount += 1;
    }
    if (record.status === "not_present_in_votes") {
      existing.notPresentInVotesCount += 1;
    }

    grouped.set(record.groupCode, existing);
  }

  return [...grouped.values()].toSorted((a, b) => a.groupCode.localeCompare(b.groupCode));
}

function parseCompressedPermanentPages(pages: string[]): ParsedAttendanceDocument {
  const records: ParsedAttendanceRecord[] = [];
  const recordPattern = new RegExp(
    `(\\d+)\\s+(.+?)\\s+(ASISTENCIA|C[ÉE]DULA|JUSTIFICADA|INASISTENCIA|COMISI[ÓO]N OFICIAL|OFICIAL COMISI[ÓO]N|PERMISO MESA DIRECTIVA|NO PRESENTE(?:S)? EN VOTACIONES)(?=\\s+\\d+\\s+|\\s+\\d+Asistencias:|$)`,
    "giu",
  );
  const groupPattern = new RegExp(knownGroupNames.map(escapeRegex).join("|"), "giu");

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const collapsed = pages[pageIndex]
      .replaceAll(/\s+/g, " ")
      .replaceAll(/P[áa]gina \d+/giu, " ")
      .trim();

    if (!collapsed) {
      continue;
    }

    groupPattern.lastIndex = 0;
    const groupMatches = [...collapsed.matchAll(groupPattern)];
    if (groupMatches.length === 0) {
      continue;
    }

    for (let matchIndex = 0; matchIndex < groupMatches.length; matchIndex += 1) {
      const currentMatch = groupMatches[matchIndex];
      const nextMatch = groupMatches[matchIndex + 1];
      const groupName = currentMatch[0];
      const start = (currentMatch.index ?? 0) + groupName.length;
      const end = nextMatch?.index ?? collapsed.length;
      const section = collapsed.slice(start, end).trim();

      const group = mapGroup(groupName);

      recordPattern.lastIndex = 0;
      for (const recordMatch of section.matchAll(recordPattern)) {
        const rowNumber = Number(recordMatch[1]);
        const rawName = recordMatch[2]?.trim();
        const rawStatus = recordMatch[3]?.trim();

        if (!rawName || !rawStatus) {
          continue;
        }

        records.push({
          groupCode: group.code,
          groupName: group.name,
          normalizedName: normalizeName(rawName),
          pageNumber: pageIndex + 1,
          rawName,
          rawStatus,
          rowNumber,
          status: mapStatus(rawStatus),
        });
      }
    }
  }

  return {
    parserPath: "compressed",
    records,
    summaries: summarizeRecords(records),
  };
}

export function parseAttendancePages(pages: string[]): ParsedAttendanceDocument {
  const records: ParsedAttendanceRecord[] = [];
  let currentGroupName = "";

  for (let pageIndex = 1; pageIndex < pages.length; pageIndex += 1) {
    const lines = pages[pageIndex]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (isHeaderLine(line)) {
        continue;
      }

      const record = parseRecordLine(line);
      if (record) {
        const group = mapGroup(currentGroupName || "Desconocido");
        records.push({
          groupCode: group.code,
          groupName: group.name,
          normalizedName: normalizeName(record.rawName),
          pageNumber: pageIndex + 1,
          rawName: record.rawName,
          rawStatus: record.rawStatus,
          rowNumber: record.rowNumber,
          status: mapStatus(record.rawStatus),
        });
        continue;
      }

      currentGroupName = line;
    }
  }

  const parsed = {
    parserPath: "standard" as const,
    records,
    summaries: summarizeRecords(records),
  };

  if (parsed.records.length < 20 && pages.some((page) => permanentReportPattern.test(page))) {
    const compressed = parseCompressedPermanentPages(pages);
    if (compressed.records.length > parsed.records.length) {
      return compressed;
    }
  }

  return parsed;
}
