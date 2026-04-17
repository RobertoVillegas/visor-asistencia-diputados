import { extractPdfTextFromBytes, fetchPdfFromUrl } from "../src/modules/pdf/extractor";
import { parseAttendancePages } from "../src/modules/attendance/parser";

type ExpectedGroup = {
  totalCount: number;
  attendanceCount: number;
  cedulaCount: number;
  justifiedAbsenceCount: number;
  absenceCount: number;
  officialCommissionCount: number;
  boardLeaveCount: number;
  notPresentInVotesCount: number;
};

type ExpectedRecord = {
  name: string;
  groupCode: string;
  status: string;
};

type Fixture = {
  label: string;
  url: string;
  expectedPageCount?: number;
  expectedRecordCount?: number;
  expectedGroupCount?: number;
  expectedGroups?: Record<string, ExpectedGroup>;
  expectedRecords?: ExpectedRecord[];
};

const fixtures: Fixture[] = [
  {
    label: "2025-12-10 ordinary session",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/dic/20251210-Asistencias.pdf",
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedGroupCount: 7,
    expectedGroups: {
      MORENA: {
        totalCount: 253,
        attendanceCount: 229,
        cedulaCount: 10,
        justifiedAbsenceCount: 6,
        absenceCount: 5,
        officialCommissionCount: 0,
        boardLeaveCount: 3,
        notPresentInVotesCount: 0,
      },
      PAN: {
        totalCount: 70,
        attendanceCount: 65,
        cedulaCount: 0,
        justifiedAbsenceCount: 3,
        absenceCount: 2,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PVEM: {
        totalCount: 62,
        attendanceCount: 58,
        cedulaCount: 0,
        justifiedAbsenceCount: 4,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PT: {
        totalCount: 49,
        attendanceCount: 45,
        cedulaCount: 2,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 1,
        boardLeaveCount: 1,
        notPresentInVotesCount: 0,
      },
      PRI: {
        totalCount: 37,
        attendanceCount: 31,
        cedulaCount: 6,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      MC: {
        totalCount: 28,
        attendanceCount: 27,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      IND: {
        totalCount: 1,
        attendanceCount: 1,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
    },
    expectedRecords: [
      { name: "Asaf Manjarrez Daniel", groupCode: "MORENA", status: "cedula" },
      { name: "Cárdenas Galván Clara", groupCode: "MORENA", status: "justified_absence" },
      { name: "Cruz Jiménez Martha Aracely", groupCode: "PT", status: "official_commission" },
      { name: "Gómez Alarcón Amarante Gonzalo", groupCode: "PT", status: "board_leave" },
      { name: "Ramírez Cuéllar Alfonso", groupCode: "MORENA", status: "absence" },
    ],
  },
  {
    label: "2025-09-09 ordinary variant SOM",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250909-Asistencias_SOM.pdf",
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedGroupCount: 7,
    expectedGroups: {
      MORENA: {
        totalCount: 253,
        attendanceCount: 247,
        cedulaCount: 0,
        justifiedAbsenceCount: 6,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PAN: {
        totalCount: 71,
        attendanceCount: 66,
        cedulaCount: 0,
        justifiedAbsenceCount: 4,
        absenceCount: 1,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PVEM: {
        totalCount: 62,
        attendanceCount: 60,
        cedulaCount: 0,
        justifiedAbsenceCount: 2,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PT: {
        totalCount: 49,
        attendanceCount: 47,
        cedulaCount: 0,
        justifiedAbsenceCount: 1,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 1,
        notPresentInVotesCount: 0,
      },
      PRI: {
        totalCount: 37,
        attendanceCount: 37,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      MC: {
        totalCount: 27,
        attendanceCount: 26,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      IND: {
        totalCount: 1,
        attendanceCount: 1,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
    },
    expectedRecords: [
      { name: "Gamboa Torales María Josefina", groupCode: "PAN", status: "absence" },
      { name: "Iñiguez Franco José Mario", groupCode: "PAN", status: "justified_absence" },
      { name: "Carranza Gómez Beatriz", groupCode: "MORENA", status: "justified_absence" },
    ],
  },
  {
    label: "2025-09-18 special session SS",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250918-Asistencias_SS.pdf",
    expectedPageCount: 17,
    expectedRecordCount: 500,
    expectedGroupCount: 7,
    expectedGroups: {
      MORENA: {
        totalCount: 253,
        attendanceCount: 215,
        cedulaCount: 1,
        justifiedAbsenceCount: 22,
        absenceCount: 4,
        officialCommissionCount: 0,
        boardLeaveCount: 11,
        notPresentInVotesCount: 0,
      },
      PAN: {
        totalCount: 70,
        attendanceCount: 57,
        cedulaCount: 0,
        justifiedAbsenceCount: 11,
        absenceCount: 2,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PVEM: {
        totalCount: 62,
        attendanceCount: 48,
        cedulaCount: 0,
        justifiedAbsenceCount: 12,
        absenceCount: 2,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PT: {
        totalCount: 49,
        attendanceCount: 44,
        cedulaCount: 1,
        justifiedAbsenceCount: 4,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PRI: {
        totalCount: 37,
        attendanceCount: 34,
        cedulaCount: 3,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      MC: {
        totalCount: 28,
        attendanceCount: 23,
        cedulaCount: 5,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      IND: {
        totalCount: 1,
        attendanceCount: 0,
        cedulaCount: 1,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
    },
    expectedRecords: [
      { name: "Vázquez Adasa Saray", groupCode: "MORENA", status: "justified_absence" },
      { name: "Ávila Anaya Francisco Arturo Federico", groupCode: "MORENA", status: "absence" },
      { name: "Ballesteros García María de los Ángeles", groupCode: "MORENA", status: "board_leave" },
    ],
  },
  {
    label: "2026-01-07 permanent session P",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2026/ene/20260107-AsistenciasP.pdf",
    expectedPageCount: 2,
    expectedRecordCount: 37,
    expectedGroupCount: 6,
    expectedGroups: {
      MORENA: {
        totalCount: 19,
        attendanceCount: 18,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 1,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PAN: {
        totalCount: 6,
        attendanceCount: 6,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PRI: {
        totalCount: 3,
        attendanceCount: 3,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PVEM: {
        totalCount: 4,
        attendanceCount: 4,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      PT: {
        totalCount: 3,
        attendanceCount: 3,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
      MC: {
        totalCount: 2,
        attendanceCount: 2,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      },
    },
    expectedRecords: [
      { name: "Castro Trenti Fernando Jorge", groupCode: "MORENA", status: "absence" },
      { name: "Núñez Monreal Magdalena del Socorro", groupCode: "PT", status: "attendance" },
      { name: "Sandoval Flores Reginaldo", groupCode: "PT", status: "attendance" },
      { name: "Colosio Riojas Luis Donaldo", groupCode: "MC", status: "attendance" },
      { name: "Zavala Gutiérrez Juan Ignacio", groupCode: "MC", status: "attendance" },
    ],
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
  for (const key of Object.keys(expected) as Array<keyof ExpectedGroup>) {
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

  if (fixture.expectedPageCount !== undefined && extracted.pageCount !== fixture.expectedPageCount) {
    errors.push(
      `Expected pageCount=${fixture.expectedPageCount}, got ${extracted.pageCount}`,
    );
  }

  if (fixture.expectedRecordCount !== undefined && parsed.records.length !== fixture.expectedRecordCount) {
    errors.push(
      `Expected recordCount=${fixture.expectedRecordCount}, got ${parsed.records.length}`,
    );
  }

  if (fixture.expectedGroupCount !== undefined && parsed.summaries.length !== fixture.expectedGroupCount) {
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
    const aggregate =
      aggregateByGroup.get(record.groupCode) ?? {
        totalCount: 0,
        attendanceCount: 0,
        cedulaCount: 0,
        justifiedAbsenceCount: 0,
        absenceCount: 0,
        officialCommissionCount: 0,
        boardLeaveCount: 0,
        notPresentInVotesCount: 0,
      };

    aggregate.totalCount += 1;
    if (record.status === "attendance") aggregate.attendanceCount += 1;
    if (record.status === "cedula") aggregate.cedulaCount += 1;
    if (record.status === "justified_absence") aggregate.justifiedAbsenceCount += 1;
    if (record.status === "absence") aggregate.absenceCount += 1;
    if (record.status === "official_commission") aggregate.officialCommissionCount += 1;
    if (record.status === "board_leave") aggregate.boardLeaveCount += 1;
    if (record.status === "not_present_in_votes") aggregate.notPresentInVotesCount += 1;

    aggregateByGroup.set(record.groupCode, aggregate);
  }

  const summaryByGroup = new Map(
    parsed.summaries.map((summary) => [
      summary.groupCode,
      {
        totalCount: summary.totalCount,
        attendanceCount: summary.attendanceCount,
        cedulaCount: summary.cedulaCount,
        justifiedAbsenceCount: summary.justifiedAbsenceCount,
        absenceCount: summary.absenceCount,
        officialCommissionCount: summary.officialCommissionCount,
        boardLeaveCount: summary.boardLeaveCount,
        notPresentInVotesCount: summary.notPresentInVotesCount,
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
      group: summary.groupCode,
      total: summary.totalCount,
      attendance: summary.attendanceCount,
      cedula: summary.cedulaCount,
      justified: summary.justifiedAbsenceCount,
      absence: summary.absenceCount,
      official: summary.officialCommissionCount,
      boardLeave: summary.boardLeaveCount,
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
