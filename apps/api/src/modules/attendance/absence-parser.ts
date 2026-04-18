import { normalizeName } from "./parser";

export interface ParsedAbsenceRecord {
  rowNumber: number;
  pageNumber: number;
  rawName: string;
  normalizedName: string;
  groupName: string;
  groupCode: string;
}

export interface ParsedAbsenceGroupSummary {
  groupName: string;
  groupCode: string;
  absenceCount: number;
}

export interface ParsedAbsenceDocument {
  records: ParsedAbsenceRecord[];
  summaries: ParsedAbsenceGroupSummary[];
}

const headerLinePattern =
  /^(SECRETARIA GENERAL|REPORTE DE INASISTENCIAS|SESI[ÓO]N|Primer Periodo|Segundo Periodo|Tercer Periodo|Comisi[óo]n Permanente|lunes,|martes,|mi[ée]rcoles,|jueves,|viernes,|s[áa]bado,|domingo,|Diputado|P[áa]gina \d+|\*\* No presente en votaciones|\d+Faltas por grupo:)/i;

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
  ["movimiento ciudadano", { code: "MC", name: "Movimiento Ciudadano" }],
  ["independiente", { code: "IND", name: "Independiente" }],
  ["independientes", { code: "IND", name: "Independiente" }],
]);

function mapGroup(groupName: string) {
  const normalized = normalizeName(groupName);
  return groupCodeMap.get(normalized) ?? { code: normalized.toUpperCase(), name: groupName };
}

function isHeaderLine(line: string): boolean {
  return headerLinePattern.test(line);
}

function parseRecordLine(line: string) {
  const rowMatch = line.match(/^(\d+)\s+(.+)$/);
  if (!rowMatch) {
    return null;
  }

  return {
    rawName: rowMatch[2].trim(),
    rowNumber: Number(rowMatch[1]),
  };
}

export function parseAbsencePages(pages: string[]): ParsedAbsenceDocument {
  const records: ParsedAbsenceRecord[] = [];
  let currentGroupName = "";

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
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
          rowNumber: record.rowNumber,
        });
        continue;
      }

      currentGroupName = line;
    }
  }

  const grouped = new Map<string, ParsedAbsenceGroupSummary>();

  for (const record of records) {
    const existing = grouped.get(record.groupCode) ?? {
      absenceCount: 0,
      groupCode: record.groupCode,
      groupName: record.groupName,
    };

    existing.absenceCount += 1;
    grouped.set(record.groupCode, existing);
  }

  return {
    records,
    summaries: [...grouped.values()].toSorted((a, b) => a.groupCode.localeCompare(b.groupCode)),
  };
}
