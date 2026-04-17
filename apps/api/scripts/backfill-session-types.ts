import { sql } from "drizzle-orm"

import { db } from "../src/db"

const result = await db.execute(sql`
  WITH updated AS (
    UPDATE sessions AS s
    SET
      session_type = CASE
        WHEN upper(coalesce(sd.raw_text, '')) LIKE '%COMISIÓN PERMANENTE%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%COMISION PERMANENTE%'
          OR s.session_page_url LIKE '%-CP-%'
          OR s.source_slug LIKE '%-CP-%'
          OR sd.url LIKE '%AsistenciasP.pdf'
          THEN 'permanent'::session_type
        WHEN upper(coalesce(sd.raw_text, '')) LIKE '%SESIÓN DE VOTACIÓN%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%SESION DE VOTACION%'
          OR s.session_page_url LIKE '%-V-%'
          OR s.source_slug LIKE '%-V-%'
          THEN 'vote'::session_type
        WHEN upper(coalesce(sd.raw_text, '')) LIKE '%SESIÓN SOLEMNE%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%SESION SOLEMNE%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%SESIÓN ESPECIAL%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%SESION ESPECIAL%'
          OR s.session_page_url LIKE '%-S-%'
          OR s.source_slug LIKE '%-S-%'
          THEN 'special'::session_type
        WHEN upper(coalesce(sd.raw_text, '')) LIKE '%SESIÓN ORDINARIA%'
          OR upper(coalesce(sd.raw_text, '')) LIKE '%SESION ORDINARIA%'
          THEN 'ordinary'::session_type
        ELSE s.session_type
      END,
      updated_at = now()
    FROM session_documents AS sd
    WHERE
      sd.session_id = s.id
      AND sd.kind = 'attendance'
      AND (
        s.session_type = 'unknown'
        OR s.session_page_url LIKE '%-CP-%'
        OR s.source_slug LIKE '%-CP-%'
      )
    RETURNING s.id, s.session_type
  )
  SELECT count(*)::int AS updated_count FROM updated;
`)

const updatedCount = Number(
  (result as { rows?: Array<{ updated_count?: number | string }> }).rows?.[0]
    ?.updated_count ?? 0
)

console.log(JSON.stringify({ updatedCount }, null, 2))
