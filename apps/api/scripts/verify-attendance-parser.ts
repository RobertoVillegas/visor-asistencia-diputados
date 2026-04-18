import { extractPdfTextFromBytes, fetchPdfFromUrl } from "../src/modules/pdf/extractor";
import { parseAttendancePages } from "../src/modules/attendance/parser";

interface ExpectedGroup {
  totalCount: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
}

interface ExpectedRecord {
  name: string;
  groupCode: string;
  status: string;
}

interface Fixture {
  label: string;
  url: string;
  expectedPageCount?: number;
  expectedRecordCount?: number;
  expectedGroupCount?: number;
  expectedGroups?: Record<string, ExpectedGroup>;
  expectedRecords?: ExpectedRecord[];
}

const fixtures: Fixture[] = [
  {
    expectedGroupCount: 7,
    expectedGroups: {
      IND: {
        absenceCount: 0,
        attendanceCount: 1,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 1,
      },
      MC: {
        absenceCount: 0,
        attendanceCount: 27,
        boardLeaveCount: 0,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 28,
      },
      MORENA: {
        absenceCount: 5,
        attendanceCount: 229,
        boardLeaveCount: 3,
        cedulaCount: 10,
        justifiedAbsenceCount: 6,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 253,
      },
      PAN: {
        absenceCount: 2,
        attendanceCount: 65,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 3,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 70,
      },
      PRI: {
        absenceCount: 0,
        attendanceCount: 31,
        boardLeaveCount: 0,
        cedulaCount: 6,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 37,
      },
      PT: {
        absenceCount: 0,
        attendanceCount: 45,
        boardLeaveCount: 1,
        cedulaCount: 2,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 1,
        totalCount: 49,
      },
      PVEM: {
        absenceCount: 0,
        attendanceCount: 58,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 4,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 62,
      },
    },
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedRecords: [
      { groupCode: "MORENA", name: "Asaf Manjarrez Daniel", status: "cedula" },
      { groupCode: "MORENA", name: "Cárdenas Galván Clara", status: "justified_absence" },
      { groupCode: "PT", name: "Cruz Jiménez Martha Aracely", status: "official_commission" },
      { groupCode: "PT", name: "Gómez Alarcón Amarante Gonzalo", status: "board_leave" },
      { groupCode: "MORENA", name: "Ramírez Cuéllar Alfonso", status: "absence" },
    ],
    label: "2025-12-10 ordinary session",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/dic/20251210-Asistencias.pdf",
  },
  {
    expectedGroupCount: 7,
    expectedGroups: {
      IND: {
        absenceCount: 0,
        attendanceCount: 1,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 1,
      },
      MC: {
        absenceCount: 0,
        attendanceCount: 26,
        boardLeaveCount: 0,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 27,
      },
      MORENA: {
        absenceCount: 0,
        attendanceCount: 247,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 6,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 253,
      },
      PAN: {
        absenceCount: 1,
        attendanceCount: 66,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 4,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 71,
      },
      PRI: {
        absenceCount: 0,
        attendanceCount: 37,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 37,
      },
      PT: {
        absenceCount: 0,
        attendanceCount: 47,
        boardLeaveCount: 1,
        cedulaCount: 0,
        justifiedAbsenceCount: 1,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 49,
      },
      PVEM: {
        absenceCount: 0,
        attendanceCount: 60,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 2,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 62,
      },
    },
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedRecords: [
      { groupCode: "PAN", name: "Gamboa Torales María Josefina", status: "absence" },
      { groupCode: "PAN", name: "Iñiguez Franco José Mario", status: "justified_absence" },
      { groupCode: "MORENA", name: "Carranza Gómez Beatriz", status: "justified_absence" },
    ],
    label: "2025-09-09 ordinary variant SOM",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250909-Asistencias_SOM.pdf",
  },
  {
    expectedGroupCount: 7,
    expectedGroups: {
      IND: {
        absenceCount: 0,
        attendanceCount: 0,
        boardLeaveCount: 0,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 1,
      },
      MC: {
        absenceCount: 0,
        attendanceCount: 23,
        boardLeaveCount: 0,
        cedulaCount: 5,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 28,
      },
      MORENA: {
        absenceCount: 4,
        attendanceCount: 215,
        boardLeaveCount: 11,
        cedulaCount: 1,
        justifiedAbsenceCount: 22,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 253,
      },
      PAN: {
        absenceCount: 2,
        attendanceCount: 57,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 11,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 70,
      },
      PRI: {
        absenceCount: 0,
        attendanceCount: 34,
        boardLeaveCount: 0,
        cedulaCount: 3,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 37,
      },
      PT: {
        absenceCount: 0,
        attendanceCount: 44,
        boardLeaveCount: 0,
        cedulaCount: 1,
        justifiedAbsenceCount: 4,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 49,
      },
      PVEM: {
        absenceCount: 2,
        attendanceCount: 48,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 12,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 62,
      },
    },
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedRecords: [
      { groupCode: "MORENA", name: "Vázquez Adasa Saray", status: "justified_absence" },
      { groupCode: "MORENA", name: "Ávila Anaya Francisco Arturo Federico", status: "absence" },
      {
        groupCode: "MORENA",
        name: "Ballesteros García María de los Ángeles",
        status: "board_leave",
      },
    ],
    label: "2025-09-18 special session SS",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250918-Asistencias_SS.pdf",
  },
  {
    expectedGroupCount: 6,
    expectedGroups: {
      MC: {
        absenceCount: 0,
        attendanceCount: 2,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 2,
      },
      MORENA: {
        absenceCount: 1,
        attendanceCount: 18,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 19,
      },
      PAN: {
        absenceCount: 0,
        attendanceCount: 6,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 6,
      },
      PRI: {
        absenceCount: 0,
        attendanceCount: 3,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 3,
      },
      PT: {
        absenceCount: 0,
        attendanceCount: 3,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 3,
      },
      PVEM: {
        absenceCount: 0,
        attendanceCount: 4,
        boardLeaveCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        notPresentInVotesCount: 0,
        officialCommissionCount: 0,
        totalCount: 4,
      },
    },
    expectedPageCount: 2,
    expectedRecordCount: 37,
    expectedRecords: [
      { groupCode: "MORENA", name: "Castro Trenti Fernando Jorge", status: "absence" },
      { groupCode: "PT", name: "Núñez Monreal Magdalena del Socorro", status: "attendance" },
      { groupCode: "PT", name: "Sandoval Flores Reginaldo", status: "attendance" },
      { groupCode: "MC", name: "Colosio Riojas Luis Donaldo", status: "attendance" },
      { groupCode: "MC", name: "Zavala Gutiérrez Juan Ignacio", status: "attendance" },
    ],
    label: "2026-01-07 permanent session P",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2026/ene/20260107-AsistenciasP.pdf",
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function compareGroupCounts(
  actual: ExpectedGroup,
  expected: ExpectedGroup,
  groupCode: string,
  errors: string[],
) {
  for (const key of Object.keys(expected) as (keyof ExpectedGroup)[]) {
    if (actual[key] !== expected[key]) {
      errors.push(
        `Group ${groupCode} mismatch for ${key}: expected ${expected[key]}, got ${actual[key]}`,
      );
    }
  }
}

async function verifyFixture(fixture: Fixture) {
  console.log(`\nVerifying parser against fixture: ${fixture.label}`);
  console.log(`PDF: ${fixture.url}`);

  const fetched = await fetchPdfFromUrl(fixture.url);
  const extracted = await extractPdfTextFromBytes(fetched.bytes);
  const parsed = parseAttendancePages(extracted.pages);

  const errors: string[] = [];

  if (
    fixture.expectedPageCount !== undefined &&
    extracted.pageCount !== fixture.expectedPageCount
  ) {
    errors.push(`Expected pageCount=${fixture.expectedPageCount}, got ${extracted.pageCount}`);
  }

  if (
    fixture.expectedRecordCount !== undefined &&
    parsed.records.length !== fixture.expectedRecordCount
  ) {
    errors.push(
      `Expected recordCount=${fixture.expectedRecordCount}, got ${parsed.records.length}`,
    );
  }

  if (
    fixture.expectedGroupCount !== undefined &&
    parsed.summaries.length !== fixture.expectedGroupCount
  ) {
    errors.push(
      `Expected groupCount=${fixture.expectedGroupCount}, got ${parsed.summaries.length}`,
    );
  }

  const unknownStatuses = parsed.records.filter((record) => record.status === "unknown");
  if (unknownStatuses.length > 0) {
    errors.push(`Found ${unknownStatuses.length} records with unknown status.`);
  }

  const distinctNames = new Set(parsed.records.map((record) => record.normalizedName));
  if (distinctNames.size !== parsed.records.length) {
    errors.push(
      `Expected unique normalized names per session; got ${parsed.records.length - distinctNames.size} duplicates.`,
    );
  }

  const aggregateByGroup = new Map<string, ExpectedGroup>();

  for (const record of parsed.records) {
    const aggregate = aggregateByGroup.get(record.groupCode) ?? {
      absenceCount: 0,
      attendanceCount: 0,
      boardLeaveCount: 0,
      cedulaCount: 0,
      justifiedAbsenceCount: 0,
      notPresentInVotesCount: 0,
      officialCommissionCount: 0,
      totalCount: 0,
    };

    aggregate.totalCount += 1;
    if (record.status === "attendance") {
      aggregate.attendanceCount += 1;
    }
    if (record.status === "cedula") {
      aggregate.cedulaCount += 1;
    }
    if (record.status === "justified_absence") {
      aggregate.justifiedAbsenceCount += 1;
    }
    if (record.status === "absence") {
      aggregate.absenceCount += 1;
    }
    if (record.status === "official_commission") {
      aggregate.officialCommissionCount += 1;
    }
    if (record.status === "board_leave") {
      aggregate.boardLeaveCount += 1;
    }
    if (record.status === "not_present_in_votes") {
      aggregate.notPresentInVotesCount += 1;
    }

    aggregateByGroup.set(record.groupCode, aggregate);
  }

  const summaryByGroup = new Map(
    parsed.summaries.map((summary) => [
      summary.groupCode,
      {
        absenceCount: summary.absenceCount,
        attendanceCount: summary.attendanceCount,
        boardLeaveCount: summary.boardLeaveCount,
        cedulaCount: summary.cedulaCount,
        justifiedAbsenceCount: summary.justifiedAbsenceCount,
        notPresentInVotesCount: summary.notPresentInVotesCount,
        officialCommissionCount: summary.officialCommissionCount,
        totalCount: summary.totalCount,
      } satisfies ExpectedGroup,
    ]),
  );

  if (fixture.expectedGroups) {
    for (const [groupCode, expected] of Object.entries(fixture.expectedGroups)) {
      const actualSummary = summaryByGroup.get(groupCode);
      if (!actualSummary) {
        errors.push(`Missing summary for group ${groupCode}`);
        continue;
      }

      compareGroupCounts(actualSummary, expected, groupCode, errors);

      const recomputed = aggregateByGroup.get(groupCode);
      if (!recomputed) {
        errors.push(`Missing recomputed aggregate for group ${groupCode}`);
        continue;
      }

      compareGroupCounts(recomputed, expected, groupCode, errors);
    }
  }

  const recomputedTotal = [...aggregateByGroup.values()].reduce(
    (acc, group) => acc + group.totalCount,
    0,
  );
  const summaryTotal = parsed.summaries.reduce((acc, group) => acc + group.totalCount, 0);

  if (recomputedTotal !== parsed.records.length) {
    errors.push(
      `Record aggregation mismatch: records=${parsed.records.length}, aggregated=${recomputedTotal}`,
    );
  }

  if (summaryTotal !== parsed.records.length) {
    errors.push(
      `Summary aggregation mismatch: records=${parsed.records.length}, summaryTotal=${summaryTotal}`,
    );
  }

  for (const expectedRecord of fixture.expectedRecords ?? []) {
    const match = parsed.records.find(
      (record) =>
        record.rawName === expectedRecord.name &&
        record.groupCode === expectedRecord.groupCode &&
        record.status === expectedRecord.status,
    );

    if (!match) {
      errors.push(
        `Missing expected record: ${expectedRecord.name} / ${expectedRecord.groupCode} / ${expectedRecord.status}`,
      );
    }
  }

  console.log(`Parsed ${parsed.records.length} records across ${parsed.summaries.length} groups.`);
  console.table(
    parsed.summaries.map((summary) => ({
      absence: summary.absenceCount,
      attendance: summary.attendanceCount,
      boardLeave: summary.boardLeaveCount,
      cedula: summary.cedulaCount,
      group: summary.groupCode,
      justified: summary.justifiedAbsenceCount,
      official: summary.officialCommissionCount,
      total: summary.totalCount,
    })),
  );

  return errors;
}

async function main() {
  const allErrors: string[] = [];

  for (const fixture of fixtures) {
    const errors = await verifyFixture(fixture);
    if (errors.length > 0) {
      allErrors.push(`${fixture.label}:\n- ${errors.join("\n- ")}`);
    }
  }

  assert(allErrors.length === 0, `Verification failed:\n${allErrors.join("\n")}`);
  console.log(`\nParser verification passed for ${fixtures.length} fixtures.`);
}

await main();
