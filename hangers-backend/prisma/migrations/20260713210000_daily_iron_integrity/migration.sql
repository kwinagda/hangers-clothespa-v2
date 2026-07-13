-- AlterTable
ALTER TABLE "iron_logs" ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "rateSource" TEXT NOT NULL DEFAULT 'CATALOG',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM iron_logs
    GROUP BY "customerId", "serviceId", date_trunc('day', date)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Daily Iron customer/service/service-date rows require review before migration';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM iron_bills
    GROUP BY "customerId", date_trunc('month', "billingPeriodStart")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Overlapping Daily Iron monthly bills require review before migration';
  END IF;
END $$;

UPDATE iron_logs AS log
SET date = date_trunc('day', log.date),
    "rateSource" = CASE
      WHEN customer."ironRateOverride" > 0 AND log."ratePerPiece" = customer."ironRateOverride"
        THEN 'CUSTOMER_OVERRIDE'
      ELSE 'LEGACY_SNAPSHOT'
    END,
    "pricingSnapshot" = jsonb_build_object(
      'source', CASE
        WHEN customer."ironRateOverride" > 0 AND log."ratePerPiece" = customer."ironRateOverride"
          THEN 'CUSTOMER_OVERRIDE'
        ELSE 'LEGACY_SNAPSHOT'
      END,
      'appliedRate', log."ratePerPiece",
      'migratedAt', CURRENT_TIMESTAMP
    )
FROM customers AS customer
WHERE customer.id = log."customerId";

UPDATE iron_bills
SET "billingPeriodStart" = date_trunc('month', "billingPeriodStart"),
    "billingPeriodEnd" = date_trunc('month', "billingPeriodStart") + INTERVAL '1 month' - INTERVAL '1 millisecond';

-- CreateIndex
CREATE UNIQUE INDEX "iron_logs_customerId_serviceId_date_key" ON "iron_logs"("customerId", "serviceId", "date");

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE iron_logs
  ADD CONSTRAINT "iron_logs_status_check" CHECK (status IN ('ACTIVE', 'VOID')),
  ADD CONSTRAINT "iron_logs_values_check" CHECK (pieces > 0 AND "ratePerPiece" > 0 AND amount > 0),
  ADD CONSTRAINT "iron_logs_void_state_check" CHECK (
    (status = 'VOID' AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND length(trim("voidReason")) >= 3)
    OR status = 'ACTIVE'
  );
