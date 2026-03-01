CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "capacity" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "gender" "gender" NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "gender" "gender" NOT NULL;