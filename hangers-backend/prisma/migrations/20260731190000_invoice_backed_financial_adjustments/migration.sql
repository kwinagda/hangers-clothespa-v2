ALTER TABLE "financial_adjustments"
  ADD COLUMN IF NOT EXISTS "invoiceId" TEXT;

ALTER TABLE "financial_adjustments"
  ALTER COLUMN "orderId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_adjustments_invoiceId_fkey'
  ) THEN
    ALTER TABLE "financial_adjustments"
      ADD CONSTRAINT "financial_adjustments_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "financial_adjustments" AS adjustment
SET "invoiceId" = invoice."id"
FROM "invoices" AS invoice
WHERE adjustment."invoiceId" IS NULL
  AND adjustment."orderId" = invoice."orderId";

CREATE INDEX IF NOT EXISTS "financial_adjustments_invoiceId_status_kind_idx"
  ON "financial_adjustments"("invoiceId", "status", "kind");
