CREATE TYPE "public"."attendance_status" AS ENUM('attendance', 'cedula', 'justified_absence', 'absence', 'official_commission', 'board_leave', 'not_present_in_votes', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."parse_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"legislator_id" uuid,
	"group_id" uuid,
	"source_document_id" uuid,
	"source_parse_run_id" uuid,
	"row_number" integer,
	"page_number" integer,
	"raw_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" "attendance_status" DEFAULT 'unknown' NOT NULL,
	"raw_status" text,
	"confidence" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_parse_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"parser_version" text NOT NULL,
	"status" "parse_run_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"metrics" jsonb
);
--> statement-breakpoint
CREATE TABLE "legislators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legislature" text NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"display_order_hint" integer,
	"current_group_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parliamentary_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legislature" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_group_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"source_document_id" uuid,
	"attendance_count" integer DEFAULT 0 NOT NULL,
	"cedula_count" integer DEFAULT 0 NOT NULL,
	"justified_absence_count" integer DEFAULT 0 NOT NULL,
	"absence_count" integer DEFAULT 0 NOT NULL,
	"official_commission_count" integer DEFAULT 0 NOT NULL,
	"board_leave_count" integer DEFAULT 0 NOT NULL,
	"not_present_in_votes_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"raw_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_legislator_id_legislators_id_fk" FOREIGN KEY ("legislator_id") REFERENCES "public"."legislators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_group_id_parliamentary_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."parliamentary_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_source_document_id_session_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."session_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_source_parse_run_id_document_parse_runs_id_fk" FOREIGN KEY ("source_parse_run_id") REFERENCES "public"."document_parse_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_parse_runs" ADD CONSTRAINT "document_parse_runs_document_id_session_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."session_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legislators" ADD CONSTRAINT "legislators_current_group_id_parliamentary_groups_id_fk" FOREIGN KEY ("current_group_id") REFERENCES "public"."parliamentary_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_group_summaries" ADD CONSTRAINT "session_group_summaries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_group_summaries" ADD CONSTRAINT "session_group_summaries_group_id_parliamentary_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."parliamentary_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_group_summaries" ADD CONSTRAINT "session_group_summaries_source_document_id_session_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."session_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_normalized_name_uidx" ON "attendance_records" USING btree ("session_id","normalized_name");--> statement-breakpoint
CREATE INDEX "attendance_records_session_status_idx" ON "attendance_records" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "document_parse_runs_document_started_at_idx" ON "document_parse_runs" USING btree ("document_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legislators_legislature_normalized_name_uidx" ON "legislators" USING btree ("legislature","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "parliamentary_groups_legislature_code_uidx" ON "parliamentary_groups" USING btree ("legislature","code");--> statement-breakpoint
CREATE UNIQUE INDEX "session_group_summaries_session_group_uidx" ON "session_group_summaries" USING btree ("session_id","group_id");