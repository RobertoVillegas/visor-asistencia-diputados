import { and, eq } from "drizzle-orm"

import { db } from "../src/db"
import {
  attendanceRecords,
  legislators,
  sessionDocuments,
  sessions,
} from "../src/db/schema"
import { env } from "../src/env"
import {
  normalizeName,
  parseAttendancePages,
} from "../src/modules/attendance/parser"

type FirecrawlScrapeResponse = {
  success?: boolean
  data?: {
    markdown?: string
    metadata?: { sourceURL?: string; url?: string }
  }
  error?: string
}

async function resolveSessionId(token: string) {
  const [byId] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1)

  if (byId) return byId.id

  const [bySlug] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.sourceSlug, token))
    .limit(1)

  return bySlug?.id ?? null
}

async function main() {
  const token = process.argv[2]

  if (!token) {
    console.error('Usage: bun run verify:firecrawl -- "<session-id-or-slug>"')
    process.exit(1)
  }

  if (!env.FIRECRAWL_API_KEY) {
    console.error("FIRECRAWL_API_KEY is not set in the environment.")
    process.exit(1)
  }

  const sessionId = await resolveSessionId(token)

  if (!sessionId) {
    console.error("Session not found for the provided id or slug.")
    process.exit(1)
  }

  const [attendanceDoc] = await db
    .select()
    .from(sessionDocuments)
    .where(
      and(
        eq(sessionDocuments.sessionId, sessionId),
        eq(sessionDocuments.kind, "attendance")
      )
    )
    .limit(1)

  if (!attendanceDoc) {
    console.error("No attendance document found for this session.")
    process.exit(1)
  }

  const dbRows = await db
    .select({
      normalizedName: legislators.normalizedName,
      status: attendanceRecords.status,
      rawName: attendanceRecords.rawName,
    })
    .from(attendanceRecords)
    .innerJoin(legislators, eq(attendanceRecords.legislatorId, legislators.id))
    .where(eq(attendanceRecords.sessionId, sessionId))

  const dbMap = new Map(
    dbRows.map((row) => [
      row.normalizedName,
      { status: row.status, rawName: row.rawName },
    ])
  )

  console.log(`Attendance PDF: ${attendanceDoc.url}`)
  console.log(`DB rows: ${dbMap.size}`)

  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      url: attendanceDoc.url,
      formats: [{ type: "markdown" }],
    }),
  })

  const payload = (await response.json()) as FirecrawlScrapeResponse

  if (!response.ok || payload.success === false) {
    console.error(
      "Firecrawl request failed:",
      payload.error ?? response.statusText
    )
    process.exit(1)
  }

  const markdown = payload.data?.markdown ?? ""

  if (!markdown) {
    console.error("Firecrawl returned empty markdown.")
    process.exit(1)
  }

  const parsed = parseAttendancePages(["", markdown])

  const fcMap = new Map(
    parsed.records.map((record) => [
      normalizeName(record.rawName),
      { status: record.status, rawName: record.rawName },
    ])
  )

  const onlyInDb = [...dbMap.keys()].filter((name) => !fcMap.has(name))
  const onlyInFirecrawl = [...fcMap.keys()].filter((name) => !dbMap.has(name))

  const statusMismatches = [...dbMap.keys()]
    .filter((name) => fcMap.has(name))
    .filter((name) => dbMap.get(name)?.status !== fcMap.get(name)?.status)

  console.log(`Firecrawl parsed rows: ${fcMap.size}`)
  console.log(`Only in DB (${onlyInDb.length}):`, onlyInDb.slice(0, 25))
  console.log(
    `Only in Firecrawl (${onlyInFirecrawl.length}):`,
    onlyInFirecrawl.slice(0, 25)
  )
  console.log(
    `Status mismatches (${statusMismatches.length}):`,
    statusMismatches.slice(0, 25)
  )

  if (
    onlyInDb.length === 0 &&
    onlyInFirecrawl.length === 0 &&
    statusMismatches.length === 0
  ) {
    console.log("No differences detected between DB and Firecrawl parse.")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
