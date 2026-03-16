DROP INDEX IF EXISTS "idx_student_class_year";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_student_class_year_term" ON "student_class_enrollments" USING btree ("student_id","academic_year_id","term_id");--> statement-breakpoint
