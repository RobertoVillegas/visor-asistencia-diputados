CREATE TABLE "session_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"attendance_document_id" uuid,
	"absence_document_id" uuid,
	"attendance_snapshot_hash" text,
	"absence_snapshot_hash" text,
	"matches" text DEFAULT 'unknown' NOT NULL,
	"attendance_absence_count" integer DEFAULT 0 NOT NULL,
	"absence_pdf_count" integer DEFAULT 0 NOT NULL,
	"missing_from_attendance_count" integer DEFAULT 0 NOT NULL,
	"extra_in_attendance_count" integer DEFAULT 0 NOT NULL,
	"group_diff_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_attendance_document_id_session_documents_id_fk" FOREIGN KEY ("attendance_document_id") REFERENCES "public"."session_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_absence_document_id_session_documents_id_fk" FOREIGN KEY ("absence_document_id") REFERENCES "public"."session_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "session_reconciliations_session_uidx" ON "session_reconciliations" USING btree ("session_id");
