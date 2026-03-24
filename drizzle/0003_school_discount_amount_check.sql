ALTER TABLE "school_details"
ADD CONSTRAINT "chk_discount_amount_by_type"
CHECK (
  (
    "discount_type" = 'percentage'
    AND "discount_amount" BETWEEN 0 AND 100
  )
  OR (
    "discount_type" = 'value'
    AND "discount_amount" >= 0
  )
);
--> statement-breakpoint