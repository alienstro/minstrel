-- kie.ai is the only music adapter. A row that still uses suno_classic or elevenlabs makes the cast
-- fail, so the migration stops and changes nothing. The CHECK constraint compares adapter with an enum
-- literal, so it must go before the type change and come back after it.
ALTER TABLE "provider_connections" DROP CONSTRAINT "provider_connections_kind_matches_adapter";--> statement-breakpoint
ALTER TYPE "public"."adapter" RENAME TO "adapter_old";--> statement-breakpoint
CREATE TYPE "public"."adapter" AS ENUM('kie', 'openai_compatible');--> statement-breakpoint
ALTER TABLE "provider_connections" ALTER COLUMN "adapter" SET DATA TYPE "public"."adapter" USING "adapter"::text::"public"."adapter";--> statement-breakpoint
ALTER TABLE "generations" ALTER COLUMN "adapter" SET DATA TYPE "public"."adapter" USING "adapter"::text::"public"."adapter";--> statement-breakpoint
DROP TYPE "public"."adapter_old";--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_kind_matches_adapter" CHECK (("provider_connections"."kind" = 'text') = ("provider_connections"."adapter" = 'openai_compatible'));--> statement-breakpoint
ALTER TABLE "generations" DROP COLUMN "flow";--> statement-breakpoint
DROP TYPE "public"."generation_flow";
