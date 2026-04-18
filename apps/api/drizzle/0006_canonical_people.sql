CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "people_normalized_name_uidx" ON "people" USING btree ("normalized_name");
--> statement-breakpoint
ALTER TABLE "legislators" ADD COLUMN "person_id" uuid;
--> statement-breakpoint
INSERT INTO "people" ("full_name", "normalized_name", "metadata")
SELECT DISTINCT ON ("normalized_name")
  "full_name",
  "normalized_name",
  "metadata"
FROM "legislators"
ORDER BY "normalized_name", "updated_at" DESC, "created_at" DESC;
--> statement-breakpoint
UPDATE "legislators"
SET "person_id" = "people"."id"
FROM "people"
WHERE "legislators"."normalized_name" = "people"."normalized_name";
--> statement-breakpoint
ALTER TABLE "legislators"
ALTER COLUMN "person_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "legislators" ADD CONSTRAINT "legislators_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "legislators_person_id_idx" ON "legislators" USING btree ("person_id");
