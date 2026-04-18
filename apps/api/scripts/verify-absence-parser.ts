import { extractPdfTextFromBytes, fetchPdfFromUrl } from "../src/modules/pdf/extractor";
import { parseAbsencePages } from "../src/modules/attendance/absence-parser";

interface ExpectedRecord {
  name: string;
  groupCode: string;
}

interface Fixture {
  label: string;
  url: string;
  expectedPageCount: number;
  expectedRecordCount: number;
  expectedGroupCount: number;
  expectedAbsenceCounts: Record<string, number>;
  expectedRecords: ExpectedRecord[];
}

const fixtures: Fixture[] = [
  {
    expectedAbsenceCounts: {
      MORENA: 5,
      PAN: 2,
    },
    expectedGroupCount: 2,
    expectedPageCount: 2,
    expectedRecordCount: 7,
    expectedRecords: [
      { groupCode: "MORENA", name: "P. Ángeles Moreno Tatiana Tonantzin" },
      { groupCode: "MORENA", name: "Ramírez Cuéllar Alfonso" },
      { groupCode: "PAN", name: "Borboa Becerra Omar Antonio" },
    ],
    label: "2025-12-10 inasistencias",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/dic/20251210-Inasistencias.pdf",
  },
  {
    expectedAbsenceCounts: {
      PAN: 1,
    },
    expectedGroupCount: 1,
    expectedPageCount: 1,
    expectedRecordCount: 1,
    expectedRecords: [{ groupCode: "PAN", name: "Gamboa Torales María Josefina" }],
    label: "2025-09-09 inasistencias SOM",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250909-Inasistencias_SOM.pdf",
  },
  {
    expectedAbsenceCounts: {
      MORENA: 4,
      PAN: 2,
      PVEM: 2,
    },
    expectedGroupCount: 3,
    expectedPageCount: 3,
    expectedRecordCount: 8,
    expectedRecords: [
      { groupCode: "MORENA", name: "Ávila Anaya Francisco Arturo Federico" },
      { groupCode: "PAN", name: "Kalionchiz de la Fuente Theodoros" },
      { groupCode: "PVEM", name: "Valladares Eichelmann Juan Carlos" },
    ],
    label: "2025-09-18 inasistencias SS",
    url: "https://gaceta.diputados.gob.mx/PDF/66/2025/sep/20250918-Inasistencias_SS.pdf",
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyFixture(fixture: Fixture) {
  console.log(`\nVerifying absence parser against fixture: ${fixture.label}`);
  console.log(`PDF: ${fixture.url}`);

  const fetched = await fetchPdfFromUrl(fixture.url);
  const extracted = await extractPdfTextFromBytes(fetched.bytes);
  const parsed = parseAbsencePages(extracted.pages);

  const errors: string[] = [];

  if (extracted.pageCount !== fixture.expectedPageCount) {
    errors.push(`Expected pageCount=${fixture.expectedPageCount}, got ${extracted.pageCount}`);
  }

  if (parsed.records.length !== fixture.expectedRecordCount) {
    errors.push(
      `Expected recordCount=${fixture.expectedRecordCount}, got ${parsed.records.length}`,
    );
  }

  if (parsed.summaries.length !== fixture.expectedGroupCount) {
    errors.push(
      `Expected groupCount=${fixture.expectedGroupCount}, got ${parsed.summaries.length}`,
    );
  }

  const distinctNames = new Set(parsed.records.map((record) => record.normalizedName));
  if (distinctNames.size !== parsed.records.length) {
    errors.push(
      `Expected unique normalized names per document; got ${parsed.records.length - distinctNames.size} duplicates.`,
    );
  }

  const summaryTotal = parsed.summaries.reduce((acc, summary) => acc + summary.absenceCount, 0);
  if (summaryTotal !== parsed.records.length) {
    errors.push(
      `Summary aggregation mismatch: records=${parsed.records.length}, summaryTotal=${summaryTotal}`,
    );
  }

  const summaryMap = new Map(
    parsed.summaries.map((summary) => [summary.groupCode, summary.absenceCount]),
  );
  for (const [groupCode, expectedCount] of Object.entries(fixture.expectedAbsenceCounts)) {
    const actual = summaryMap.get(groupCode);
    if (actual !== expectedCount) {
      errors.push(
        `Group ${groupCode} mismatch: expected ${expectedCount}, got ${actual ?? "missing"}`,
      );
    }
  }

  for (const expectedRecord of fixture.expectedRecords) {
    const match = parsed.records.find(
      (record) =>
        record.rawName === expectedRecord.name && record.groupCode === expectedRecord.groupCode,
    );

    if (!match) {
      errors.push(
        `Missing expected absence record: ${expectedRecord.name} / ${expectedRecord.groupCode}`,
      );
    }
  }

  console.log(
    `Parsed ${parsed.records.length} absence records across ${parsed.summaries.length} groups.`,
  );
  console.table(
    parsed.summaries.map((summary) => ({
      absence: summary.absenceCount,
      group: summary.groupCode,
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
  console.log(`\nAbsence parser verification passed for ${fixtures.length} fixtures.`);
}

await main();
