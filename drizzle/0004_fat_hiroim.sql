ALTER TABLE "student_class_enrollments"
ADD COLUMN "class_teacher_signature_url" text;
--> statement-breakpoint
ALTER TABLE "student_class_enrollments"
ADD COLUMN "general_comments" text;
--> statement-breakpoint
ALTER TABLE "student_class_enrollments"
ADD COLUMN "supervisor_signature_url" text;