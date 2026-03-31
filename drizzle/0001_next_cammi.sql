ALTER TABLE "classes" ADD COLUMN "class_teacher_signature_url" text;--> statement-breakpoint
ALTER TABLE "student_class_enrollments" DROP COLUMN "class_teacher_signature_url";