ALTER TABLE "staff" ADD COLUMN "image_cld_pub_id" varchar(255);--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "registration_number" varchar(50);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "image_cld_pub_id" varchar(255);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "image_cld_pub_id" varchar(255);--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_registration_number_unique" UNIQUE("registration_number");