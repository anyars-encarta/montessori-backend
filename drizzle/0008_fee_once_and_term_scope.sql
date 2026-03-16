ALTER TABLE "fees" ADD COLUMN "applicable_term_id" integer;--> statement-breakpoint
ALTER TABLE "fees" ADD COLUMN "apply_once" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fees" ADD CONSTRAINT "fees_applicable_term_id_terms_id_fk" FOREIGN KEY ("applicable_term_id") REFERENCES "public"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
