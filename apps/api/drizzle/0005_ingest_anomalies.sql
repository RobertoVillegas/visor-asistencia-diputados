CREATE TABLE "ingest_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"document_id" uuid,
	"parse_run_id" uuid,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"snippet" text,
	"source_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_anomalies" ADD CONSTRAINT "ingest_anomalies_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ingest_anomalies" ADD CONSTRAINT "ingest_anomalies_document_id_session_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."session_documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ingest_anomalies" ADD CONSTRAINT "ingest_anomalies_parse_run_id_document_parse_runs_id_fk" FOREIGN KEY ("parse_run_id") REFERENCES "public"."document_parse_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ingest_anomalies_session_created_idx" ON "ingest_anomalies" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX "ingest_anomalies_kind_idx" ON "ingest_anomalies" USING btree ("kind");
