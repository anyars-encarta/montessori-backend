ALTER TYPE "public"."fee_type" RENAME TO "fee_type_old";--> statement-breakpoint
CREATE TYPE "public"."fee_type" AS ENUM('admission', 'tuition', 'feeding', 'other');--> statement-breakpoint
ALTER TABLE "fees"
ALTER COLUMN "fee_type"
SET DATA TYPE "public"."fee_type"
USING (
  CASE
    WHEN "fee_type"::text = 'promotion' THEN 'feeding'
    ELSE "fee_type"::text
  END
)::"public"."fee_type";--> statement-breakpoint
DROP TYPE "public"."fee_type_old";