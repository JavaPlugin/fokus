CREATE TABLE "calendar_feed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_day" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "energy_day_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "time_block" ADD COLUMN "feed_id" uuid;--> statement-breakpoint
ALTER TABLE "time_block" ADD COLUMN "ext_id" text;--> statement-breakpoint
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_day" ADD CONSTRAINT "energy_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_feed_user" ON "calendar_feed" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_feed_id_calendar_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."calendar_feed"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_feed_ext" UNIQUE("user_id","feed_id","ext_id");