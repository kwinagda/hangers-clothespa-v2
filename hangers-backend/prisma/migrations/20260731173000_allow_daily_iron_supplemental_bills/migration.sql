DROP INDEX IF EXISTS "iron_bills_customerId_billingPeriodStart_key";

CREATE INDEX IF NOT EXISTS "iron_bills_customerId_billingPeriodStart_idx"
  ON "iron_bills"("customerId", "billingPeriodStart");
