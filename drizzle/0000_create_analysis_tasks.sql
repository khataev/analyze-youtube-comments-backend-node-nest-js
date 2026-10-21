CREATE TABLE "analysis_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_tasks_status_check" CHECK ("analysis_tasks"."status" in ('pending', 'processing', 'completed', 'failed'))
);
