-- DropForeignKey
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_orderId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountApprovedById" TEXT,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "loyaltyDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "writeOffApprovedById" TEXT,
ADD COLUMN     "writeOffReason" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "catalogUnitPrice" DECIMAL(18,2),
ADD COLUMN     "priceOverriddenById" TEXT,
ADD COLUMN     "priceOverrideReason" TEXT,
ADD COLUMN     "priceSource" TEXT NOT NULL DEFAULT 'CATALOG',
ADD COLUMN     "pricingSnapshot" JSONB;

-- AlterTable
ALTER TABLE "OrderStage" ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT 'LEGACY_STAGE',
ADD COLUMN     "fromStatus" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "toStatus" TEXT;

ALTER TABLE "OrderStage" ALTER COLUMN "eventType" SET DEFAULT 'WORKFLOW_TRANSITION';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN     "referenceFingerprint" TEXT,
ADD COLUMN     "reversalOfId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "balanceAfter" DECIMAL(18,2),
ADD COLUMN     "balanceBefore" DECIMAL(18,2),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "reasonCode" TEXT NOT NULL DEFAULT 'MANUAL_ADJUSTMENT',
ADD COLUMN     "reversalOfId" TEXT;

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(18,2) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "actorId" TEXT,
    "requestHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROCESSING',
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_adjustments_orderId_status_kind_idx" ON "financial_adjustments"("orderId", "status", "kind");

-- CreateIndex
CREATE INDEX "financial_adjustments_createdAt_idx" ON "financial_adjustments"("createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_records_state_lockedUntil_idx" ON "idempotency_records"("state", "lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_orderId_key" ON "payment_allocations"("paymentId", "orderId");

-- CreateIndex
CREATE INDEX "payment_allocations_orderId_status_idx" ON "payment_allocations"("orderId", "status");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_status_idx" ON "payment_allocations"("paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_referenceFingerprint_key" ON "Payment"("referenceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_transactions_orderId_idx" ON "wallet_transactions"("orderId");

-- CreateIndex
CREATE INDEX "wallet_transactions_externalReference_idx" ON "wallet_transactions"("externalReference");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountApprovedById_fkey" FOREIGN KEY ("discountApprovedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_writeOffApprovedById_fkey" FOREIGN KEY ("writeOffApprovedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_priceOverriddenById_fkey" FOREIGN KEY ("priceOverriddenById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "financial_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshot legacy commercial values and connect historical payments to their
-- customer. New writes are populated authoritatively by the CRM services.
UPDATE "OrderItem"
SET "catalogUnitPrice" = COALESCE("baseUnitPrice", "unitPrice"),
    "priceSource" = 'LEGACY_SNAPSHOT',
    "pricingSnapshot" = jsonb_build_object(
      'migratedAt', CURRENT_TIMESTAMP,
      'catalogUnitPrice', COALESCE("baseUnitPrice", "unitPrice"),
      'unitPrice', "unitPrice",
      'lineDiscountType', "lineDiscountType",
      'lineDiscountValue', "lineDiscountValue",
      'lineDiscountAmount', "lineDiscountAmount"
    )
WHERE "catalogUnitPrice" IS NULL;

UPDATE "Payment" AS payment
SET "customerId" = orders."customerId"
FROM "Order" AS orders
WHERE payment."orderId" = orders."id"
  AND payment."customerId" IS NULL;

UPDATE "Payment"
SET "amount" = abs("amount"),
    "kind" = 'REFUND',
    "reversalReason" = COALESCE("reversalReason", 'Legacy signed refund converted to an explicit refund transaction')
WHERE "amount" < 0;

UPDATE "Payment"
SET "referenceFingerprint" = md5(
  upper("method") || ':' || upper(regexp_replace(trim("reference"), '\s+', '', 'g'))
)
WHERE nullif(trim("reference"), '') IS NOT NULL
  AND "referenceFingerprint" IS NULL;

-- Imported negative RT documents are credit/return records. Preserve their
-- signed values but classify them so normal sale constraints do not misstate
-- them as corrupt positive-value orders.
UPDATE "Order" AS return_order
SET "isReturn" = true,
    "returnReason" = COALESCE(return_order."returnReason", 'Legacy return document migrated from signed order history'),
    "originalOrderId" = COALESCE(
      return_order."originalOrderId",
      (
        SELECT original."id"
        FROM "Order" AS original
        WHERE original."orderNumber" = regexp_replace(return_order."orderNumber", '-RT-[0-9]+$', '')
        LIMIT 1
      )
    )
WHERE return_order."totalAmount" < 0
   OR return_order."orderNumber" ~ '-RT-[0-9]+$';

-- Allocate captured legacy receipts in timestamp order, capped at the order
-- total. Any remainder stays on the Payment as explicit unapplied customer
-- credit rather than inflating the order balance or silently creating wallet.
WITH running_payments AS (
  SELECT
    payment."id" AS payment_id,
    payment."orderId" AS order_id,
    payment."amount",
    GREATEST(orders."totalAmount", 0) AS order_total,
    COALESCE(
      SUM(payment."amount") OVER (
        PARTITION BY payment."orderId"
        ORDER BY payment."createdAt", payment."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS prior_receipts
  FROM "Payment" AS payment
  JOIN "Order" AS orders ON orders."id" = payment."orderId"
  WHERE payment."status" IN ('CAPTURED', 'SUCCESS', 'PAID')
    AND payment."kind" = 'RECEIPT'
), allocations AS (
  SELECT
    payment_id,
    order_id,
    LEAST(amount, GREATEST(order_total - prior_receipts, 0)) AS allocated_amount
  FROM running_payments
)
INSERT INTO "payment_allocations" ("id", "paymentId", "orderId", "amount", "status", "reason", "createdAt")
SELECT
  'legacy-allocation-' || payment_id,
  payment_id,
  order_id,
  allocated_amount,
  'POSTED',
  'Legacy captured receipt allocation',
  CURRENT_TIMESTAMP
FROM allocations
WHERE allocated_amount > 0
ON CONFLICT ("paymentId", "orderId") DO NOTHING;

UPDATE "Order" AS orders
SET "paidAmount" = COALESCE((
  SELECT SUM(allocation."amount")
  FROM "payment_allocations" AS allocation
  JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
  WHERE allocation."orderId" = orders."id"
    AND allocation."status" = 'POSTED'
    AND payment."status" IN ('CAPTURED', 'SUCCESS', 'PAID')
), 0),
"paymentStatus" = CASE
  WHEN orders."totalAmount" <= 0 THEN 'PAID'
  WHEN COALESCE((
    SELECT SUM(allocation."amount")
    FROM "payment_allocations" AS allocation
    JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
    WHERE allocation."orderId" = orders."id"
      AND allocation."status" = 'POSTED'
      AND payment."status" IN ('CAPTURED', 'SUCCESS', 'PAID')
  ), 0) + orders."writeOffAmount" >= orders."totalAmount" THEN 'PAID'
  WHEN COALESCE((
    SELECT SUM(allocation."amount")
    FROM "payment_allocations" AS allocation
    JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
    WHERE allocation."orderId" = orders."id"
      AND allocation."status" = 'POSTED'
      AND payment."status" IN ('CAPTURED', 'SUCCESS', 'PAID')
  ), 0) + orders."writeOffAmount" > 0 THEN 'PARTIAL'
  ELSE 'UNPAID'
END
WHERE orders."documentType" = 'ORDER';

-- Convert imported wallet cache balances into explicit opening-balance ledger
-- entries. This retains the balance while making future reconciliation possible.
INSERT INTO "wallet_transactions" (
  "id", "customerId", "amount", "type", "reasonCode", "reason",
  "balanceBefore", "balanceAfter", "idempotencyKey", "createdAt"
)
SELECT
  'legacy-wallet-opening-' || customer."id",
  customer."id",
  abs(customer."walletBalance"),
  CASE WHEN customer."walletBalance" >= 0 THEN 'CREDIT' ELSE 'DEBIT' END,
  'IMPORT_OPENING_BALANCE',
  'Legacy wallet opening balance migrated into immutable ledger',
  0,
  customer."walletBalance",
  'legacy-wallet-opening:' || customer."id",
  customer."createdAt"
FROM "customers" AS customer
WHERE customer."walletBalance" <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "wallet_transactions" AS existing
    WHERE existing."customerId" = customer."id"
  )
ON CONFLICT ("id") DO NOTHING;

UPDATE "Order"
SET "discountReason" = COALESCE("discountReason", 'Legacy commercial value migrated without an original structured reason'),
    "discountApprovedById" = COALESCE("discountApprovedById", "assignedToId")
WHERE "discount" > 0;

DO $$
DECLARE
  fallback_staff_id TEXT;
BEGIN
  SELECT "id" INTO fallback_staff_id FROM "staff" WHERE "isActive" = true ORDER BY "createdAt" LIMIT 1;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "writeOffAmount" > 0) AND fallback_staff_id IS NULL THEN
    RAISE EXCEPTION 'Cannot migrate legacy write-offs because no staff actor exists';
  END IF;

  INSERT INTO "financial_adjustments" (
    "id", "orderId", "kind", "status", "amount", "reasonCode", "reason",
    "createdById", "approvedById", "createdAt"
  )
  SELECT
    'legacy-writeoff-' || orders."id",
    orders."id",
    'WRITE_OFF',
    'POSTED',
    orders."writeOffAmount",
    'LEGACY_MIGRATION',
    COALESCE(orders."writeOffReason", 'Legacy write-off migrated without an original structured reason'),
    COALESCE(orders."assignedToId", fallback_staff_id),
    COALESCE(orders."assignedToId", fallback_staff_id),
    orders."updatedAt"
  FROM "Order" AS orders
  WHERE orders."writeOffAmount" > 0
  ON CONFLICT ("id") DO NOTHING;

  UPDATE "Order"
  SET "writeOffReason" = COALESCE("writeOffReason", 'Legacy write-off migrated without an original structured reason'),
      "writeOffApprovedById" = COALESCE("writeOffApprovedById", "assignedToId", fallback_staff_id)
  WHERE "writeOffAmount" > 0;
END $$;

-- Database constraints backstop controller validation and prevent negative or
-- structurally invalid financial rows from entering through imports or scripts.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_nonnegative_money_check" CHECK (
    (
      "isReturn" = true AND "subtotal" <= 0 AND "totalAmount" <= 0 AND
      "paidAmount" = 0 AND "writeOffAmount" = 0
    ) OR (
      "subtotal" >= 0 AND "discount" >= 0 AND "couponDiscount" >= 0 AND
      "loyaltyDiscount" >= 0 AND "totalAmount" >= 0 AND "paidAmount" >= 0 AND
      "writeOffAmount" >= 0 AND "discount" + "couponDiscount" + "loyaltyDiscount" <= "subtotal"
    )
  ),
  ADD CONSTRAINT "Order_payment_bounds_check" CHECK (
    ("isReturn" = true AND "totalAmount" <= 0) OR "paidAmount" + "writeOffAmount" <= "totalAmount"
  ),
  ADD CONSTRAINT "Order_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_values_check" CHECK (
    "quantity" > 0 AND "unitPrice" >= 0 AND "subtotal" >= 0 AND
    "lineDiscountValue" >= 0 AND "lineDiscountAmount" >= 0
  );

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "Payment_kind_check" CHECK ("kind" IN ('RECEIPT', 'REFUND', 'REVERSAL')),
  ADD CONSTRAINT "Payment_status_check" CHECK ("status" IN ('INITIATED', 'PENDING', 'CAPTURED', 'SUCCESS', 'PAID', 'FAILED', 'VOIDED', 'REFUNDED'));

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_allocations_status_check" CHECK ("status" IN ('POSTED', 'REVERSED'));

ALTER TABLE "wallet_transactions"
  ADD CONSTRAINT "wallet_transactions_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "wallet_transactions_type_check" CHECK ("type" IN ('CREDIT', 'DEBIT', 'REVERSAL')),
  ADD CONSTRAINT "wallet_transactions_balance_check" CHECK (
    "balanceBefore" IS NULL OR "balanceAfter" IS NULL OR
    ("type" = 'CREDIT' AND "balanceAfter" = "balanceBefore" + "amount") OR
    ("type" = 'DEBIT' AND "balanceAfter" = "balanceBefore" - "amount") OR
    "type" = 'REVERSAL'
  );

ALTER TABLE "financial_adjustments"
  ADD CONSTRAINT "financial_adjustments_amount_positive_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "financial_adjustments_kind_check" CHECK ("kind" IN ('WRITE_OFF', 'CREDIT', 'DEBIT', 'REVERSAL')),
  ADD CONSTRAINT "financial_adjustments_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'POSTED', 'REVERSED', 'REJECTED'));

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_state_check" CHECK ("state" IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  ADD CONSTRAINT "idempotency_records_expiry_check" CHECK ("expiresAt" > "createdAt");
