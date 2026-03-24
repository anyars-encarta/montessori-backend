ALTER TABLE "terms" ADD COLUMN "holiday_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;
