CREATE TYPE "public"."adapter" AS ENUM('kie', 'suno_classic', 'elevenlabs', 'openai_compatible');--> statement-breakpoint
CREATE TYPE "public"."connection_kind" AS ENUM('music', 'text');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('unchecked', 'ok', 'invalid_key', 'unreachable');--> statement-breakpoint
CREATE TYPE "public"."generation_flow" AS ENUM('job', 'direct');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('submitting', 'pending', 'text_ready', 'first_ready', 'queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."storage_status" AS ENUM('pending', 'stored', 'copy_failed');--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid,
	"adapter" "adapter" NOT NULL,
	"flow" "generation_flow" NOT NULL,
	"provider_task_id" text,
	"callback_token_hash" "bytea",
	"status" "generation_status" NOT NULL,
	"input" jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"next_poll_at" timestamp with time zone,
	"poll_attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "connection_kind" NOT NULL,
	"adapter" "adapter" NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"key_ciphertext" "bytea" NOT NULL,
	"key_iv" "bytea" NOT NULL,
	"key_tag" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"key_last4" text NOT NULL,
	"default_model" text,
	"status" "connection_status" DEFAULT 'unchecked' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_kind_matches_adapter" CHECK (("provider_connections"."kind" = 'text') = ("provider_connections"."adapter" = 'openai_compatible'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"generation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_track_id" text NOT NULL,
	"title" text NOT NULL,
	"style" text,
	"lyrics" text,
	"duration_seconds" numeric,
	"audio_key" text,
	"cover_key" text,
	"storage_status" "storage_status" DEFAULT 'pending' NOT NULL,
	"copy_attempts" integer DEFAULT 0 NOT NULL,
	"provider_audio_url" text,
	"provider_cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generations_connection_task_idx" ON "generations" USING btree ("connection_id","provider_task_id");--> statement-breakpoint
CREATE INDEX "generations_status_next_poll_idx" ON "generations" USING btree ("status","next_poll_at");--> statement-breakpoint
CREATE INDEX "generations_user_created_idx" ON "generations" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_user_label_idx" ON "provider_connections" USING btree ("user_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_generation_provider_track_idx" ON "tracks" USING btree ("generation_id","provider_track_id");--> statement-breakpoint
CREATE INDEX "tracks_user_created_idx" ON "tracks" USING btree ("user_id","created_at" DESC NULLS LAST);