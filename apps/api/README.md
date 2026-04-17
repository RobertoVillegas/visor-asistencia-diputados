# API

Small Bun backend for:

- crawling the Cámara de Diputados attendance index
- persisting discovered sessions and PDF links
- extracting raw text from attendance PDFs
- exposing a simple Hono API

## Stack

- Bun
- Hono
- Drizzle ORM
- PostgreSQL 18
- Better Auth
- `unpdf` for PDF text extraction

`unpdf` is used here instead of `@libpdf/core` because it is easier to verify as a current Bun-friendly extraction library and has a straightforward text extraction API.

## Setup

1. Copy `.env.example` to `.env`
   `ADMIN_EMAILS` defaults to `roberto@athas.mx`.
2. Start Postgres:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
bun install
```

4. Generate Drizzle migrations:

```bash
bun run db:generate
```

5. Apply migrations:

```bash
bun run db:migrate
```

6. Generate Better Auth schema if you want auth tables managed by its CLI:

```bash
bun run auth:generate
```

7. Run the API:

```bash
bun run dev
```

## Endpoints

Public:
- `GET /health`
- `GET /api/periods`
- `GET /api/sessions`
- `GET /api/sessions/parsed`
- `GET /api/documents`
- `GET /api/documents/:id/snapshots`
- `GET /api/legislators`
- `GET /api/legislators/:id`
- `GET /api/legislators/:id/attendance`
- `GET /api/analytics/overview`
- `GET /api/analytics/parties`
- `GET /api/analytics/trends/parties`
- `GET /api/analytics/trends/legislator/:id`
- `GET /api/analytics/sessions/:id/composition`
- `GET /api/analytics/quality`
- `GET /api/analytics/session-quality`

Authenticated:
- `GET /api/session`

Admin only:
- `POST /api/crawl/discover`
- `POST /api/crawl/snapshot-session-document`
- `POST /api/crawl/extract-session-document`
- `POST /api/crawl/parse-attendance-document`
- `POST /api/crawl/parse-period-attendance`
- `POST /api/crawl/reconcile-session-absences`
- `POST /api/crawl/reconcile-period-absences`
- `POST /api/crawl/process-period`
- `POST /api/documents/:id/snapshot`

Auth:
- `GET|POST /api/auth/*`

## Notes

- The crawler does not infer PDF names from session URLs because the site uses inconsistent file naming.
- The first version stores raw extracted PDF text. Converting that raw text into reliable deputy-by-deputy attendance rows should be a second parsing pass once you inspect several PDF variants.
- Each document can now be snapshotted repeatedly. Snapshots store a SHA-256 content hash plus fetch metadata so you can detect whether a PDF changed between checks.
- Admin authorization is derived from the Better Auth session automatically. The server reads the session from request headers/cookies and checks whether `user.email` is included in `ADMIN_EMAILS`.
- The intended production flow is:
  1. discover or refresh session documents
  2. create a snapshot
  3. compare the latest hash with the previous snapshot
  4. only reparse when the snapshot status is `changed` or when no parsed data exists yet
  5. reconcile parsed absences against the official `Inasistencias` PDF

## Recommended Admin Workflow

For a full exercise year or legislature period, use:

```bash
curl -X POST http://localhost:3001/api/crawl/process-period \
  -H 'content-type: application/json' \
  -b cookie.txt \
  -d '{"periodPageUrl":"https://gaceta.diputados.gob.mx/gp66_Asis2.html"}'
```

Or, if the period is already stored:

```bash
curl -X POST http://localhost:3000/api/crawl/process-period \
  -H 'content-type: application/json' \
  -b cookie.txt \
  -d '{"periodId":"<stored-period-id>"}'
```

Set `"forceParseAll": true` if you want to reparse every attendance document regardless of snapshot state.

## Quality Endpoints

Overview for a legislature or period:

```bash
curl "http://localhost:3000/api/analytics/quality?legislature=LXVI&periodId=<stored-period-id>"
```

Session-by-session quality table:

```bash
curl "http://localhost:3000/api/analytics/session-quality?legislature=LXVI&periodId=<stored-period-id>"
```
