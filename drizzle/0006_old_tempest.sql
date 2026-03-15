ALTER TABLE "fees" ALTER COLUMN "fee_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."fee_type";--> statement-breakpoint
CREATE TYPE "public"."fee_type" AS ENUM('admission', 'tuition', 'feeding', 'other');--> statement-breakpoint
ALTER TABLE "fees" ALTER COLUMN "fee_type" SET DATA TYPE "public"."fee_type" USING "fee_type"::"public"."fee_type";--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "address" text;