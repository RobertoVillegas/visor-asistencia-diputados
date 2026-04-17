import * as cheerio from "cheerio";

import type { DiscoveredSession, LegislativePeriod, SessionDocumentLink } from "./types";

const BASE_URL = "https://gaceta.diputados.gob.mx";

const monthMap = new Map<string, number>([
  ["enero", 0],
  ["febrero", 1],
  ["marzo", 2],
  ["abril", 3],
  ["mayo", 4],
  ["junio", 5],
  ["julio", 6],
  ["agosto", 7],
  ["septiembre", 8],
  ["octubre", 9],
  ["noviembre", 10],
  ["diciembre", 11],
]);

function absoluteUrl(input: string): string {
  return new URL(input, BASE_URL).toString();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function inferSessionType(sessionPageUrl: string, title: string): DiscoveredSession["sessionType"] {
  const value = `${sessionPageUrl} ${title}`.toLowerCase();

  if (value.includes("comisi") && value.includes("permanente")) return "permanent";
  if (value.includes("-v-") || value.includes(" vot")) return "vote";
  if (value.includes("-s-") || (value.includes("sesi") && value.includes("especial"))) return "special";
  if (value.includes("ordinaria")) return "ordinary";
  return "unknown";
}

function parseGacetaNumber(title: string): number | null {
  const match = title.match(/n\S*mero\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function parseSpanishDate(title: string): Date | null {
  const match = title.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (!match) return null;

  const day = Number(match[1]);
  const month = monthMap.get(match[2].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""));
  const year = Number(match[3]);

  if (month === undefined) return null;
  return new Date(Date.UTC(year, month, day, 18, 0, 0));
}

export async function fetchAttendancePeriods(): Promise<LegislativePeriod[]> {
  const html = await fetch(absoluteUrl("/gp_asistencias.html")).then((res) => res.text());
  const $ = cheerio.load(html);

  const periods: LegislativePeriod[] = [];
  let currentLegislature = "";

  for (const table of $("table").toArray()) {
    const text = normalizeText($(table).text());
    const legislatureMatch = text.match(/durante la\s+(LXVI|LXV|LXIV|LXIII|LXII|LXI|LX)\s+Legislatura/i);
    if (legislatureMatch) {
      currentLegislature = legislatureMatch[1].toUpperCase();
    }

    $(table)
      .find("a[href*='Asis']")
      .each((_, anchor) => {
        const label = normalizeText($(anchor).text());
        const href = $(anchor).attr("href");
        if (!href || !currentLegislature) return;

        const yearSpanMatch = label.match(/(septiembre\s+\d{4}\s+-\s+agosto\s+\d{4})/i);

        periods.push({
          label,
          legislature: currentLegislature,
          yearSpan: yearSpanMatch?.[1] ?? label,
          periodPageUrl: absoluteUrl(href),
        });
      });
  }

  return periods;
}

export async function fetchSessionsFromPeriod(periodPageUrl: string): Promise<string[]> {
  const html = await fetch(periodPageUrl).then((res) => res.text());
  const $ = cheerio.load(html);

  return $("a[href*='Asistencias.html']")
    .toArray()
    .map((anchor) => $(anchor).attr("href"))
    .filter((href): href is string => Boolean(href))
    .map((href) => absoluteUrl(href));
}

function extractDocumentLinks(html: string): SessionDocumentLink[] {
  const $ = cheerio.load(html);

  return $("a[href$='.pdf']")
    .toArray()
    .map((anchor) => {
      const href = $(anchor).attr("href");
      const label = normalizeText($(anchor).text());
      if (!href) return null;

      const lower = label.toLowerCase();
      if (lower.includes("inasistencias")) {
        return { kind: "absence" as const, url: absoluteUrl(href), label };
      }
      if (lower.includes("asistencias")) {
        return { kind: "attendance" as const, url: absoluteUrl(href), label };
      }
      return null;
    })
    .filter((value): value is SessionDocumentLink => value !== null);
}

export async function fetchSessionDetails(sessionPageUrl: string): Promise<DiscoveredSession> {
  const html = await fetch(sessionPageUrl).then((res) => res.text());
  const $ = cheerio.load(html);
  const title = normalizeText($("#NGaceta").text() || $("title").text());
  const documents = extractDocumentLinks(html);
  const sourceSlug = sessionPageUrl.split("/").at(-1)?.replace(/\.html$/i, "") ?? sessionPageUrl;

  return {
    title,
    gacetaNumber: parseGacetaNumber(title),
    sessionDate: parseSpanishDate(title),
    sessionType: inferSessionType(sessionPageUrl, title),
    sessionPageUrl,
    sourceSlug,
    documents,
  };
}
