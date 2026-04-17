CREATE TYPE "public"."snapshot_status" AS ENUM('fetched', 'unchanged', 'changed', 'failed');--> statement-breakpoint
CREATE TABLE "document_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"previous_snapshot_id" uuid,
	"source_url" text NOT NULL,
	"status" "snapshot_status" DEFAULT 'fetched' NOT NULL,
	"content_hash" text,
	"byte_size" integer,
	"etag" text,
	"last_modified" text,
	"content_type" text,
	"http_status" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "session_documents" ADD COLUMN "latest_content_hash" text;--> statement-breakpoint
ALTER TABLE "session_documents" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_documents" ADD COLUMN "last_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_document_id_session_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."session_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_snapshots_document_fetched_at_idx" ON "document_snapshots" USING btree ("document_id","fetched_at");