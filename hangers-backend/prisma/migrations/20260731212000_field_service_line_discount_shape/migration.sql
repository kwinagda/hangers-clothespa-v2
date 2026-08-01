ALTER TABLE "service_appointment_lines"
  ADD COLUMN IF NOT EXISTS "lineDiscountType" TEXT,
  ADD COLUMN IF NOT EXISTS "lineDiscountValue" DECIMAL(18,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_lines_discount_type_check') THEN
    ALTER TABLE "service_appointment_lines"
      ADD CONSTRAINT "service_appointment_lines_discount_type_check"
      CHECK ("lineDiscountType" IS NULL OR "lineDiscountType" IN ('FLAT', 'PERCENT'));
  END IF;
END $$;
