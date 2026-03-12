CREATE TYPE "public"."discount_type" AS ENUM('value', 'percentage');--> statement-breakpoint
ALTER TABLE "school_details" ADD COLUMN "discount_type" "discount_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "school_details" ADD COLUMN "discount_amount" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "on_scholarship" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "get_discount" boolean DEFAULT false NOT NULL;