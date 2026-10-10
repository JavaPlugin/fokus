CREATE TABLE "task_occurrence" (
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"day" date NOT NULL,
	"done_at" timestamp with time zone,
	"skipped" boolean DEFAULT false NOT NULL,
	"title" text,
	"minutes" integer,
	"time" text,
	CONSTRAINT "task_occurrence_task_id_day_pk" PRIMARY KEY("task_id","day")
);
--> statement-breakpoint
-- Offene Notizen aus der Inbox werden Aufgaben: später, 30 Min., Art Arbeit.
INSERT INTO "task" ("user_id", "title", "created_at")
  SELECT "user_id", left("text", 200), "created_at" FROM "inbox_item" WHERE "status" = 'open';--> statement-breakpoint
ALTER TABLE "energy_day" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inbox_item" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "energy_day" CASCADE;--> statement-breakpoint
DROP TABLE "inbox_item" CASCADE;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "minutes" SET DEFAULT 30;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "kind" text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "schedule" text DEFAULT 'later' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "fixed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "anchor" date DEFAULT current_date NOT NULL;--> statement-breakpoint
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrence" ADD CONSTRAINT "task_occurrence_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" DROP COLUMN "heavy";--> statement-breakpoint
ALTER TABLE "task" DROP COLUMN "mini";