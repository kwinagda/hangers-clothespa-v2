-- DropIndex
DROP INDEX "payment_allocations_paymentId_orderId_key";

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "customerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'POSTED',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "payment_allocations" ADD COLUMN     "invoiceId" TEXT,
ALTER COLUMN "orderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "ironBillId" TEXT,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,2) NOT NULL,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 7,
    "version" INTEGER NOT NULL DEFAULT 1,
    "postedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "lineType" TEXT NOT NULL DEFAULT 'SERVICE',
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_revisions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'FINANCIAL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "initiatedBy" TEXT,
    "scheduleKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "exceptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "metadata" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "sequenceKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'DEFAULT',
    "documentType" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'ALL',
    "nextValue" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- Refuse to conceal invalid legacy Daily Iron balances. They must be reviewed
-- before migration rather than clipped into an apparently balanced invoice.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "iron_bills"
    WHERE "paidAmount" < 0 OR "totalAmount" < 0 OR "paidAmount" > "totalAmount"
  ) THEN
    RAISE EXCEPTION 'Invalid Daily Iron paid/total balance found; reconcile before migration';
  END IF;
END $$;

-- Backfill one canonical invoice per commercial order. Numbering is stable for
-- this migration and the database sequence is seeded below for future writes.
WITH ordered_orders AS (
  SELECT orders.*,
         row_number() OVER (ORDER BY orders."createdAt", orders."id") AS invoice_position,
         COALESCE((
           SELECT SUM(allocation.amount)
           FROM "payment_allocations" AS allocation
           JOIN "Payment" AS payment ON payment."id" = allocation."paymentId"
           WHERE allocation."orderId" = orders."id"
             AND allocation.status = 'POSTED'
             AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
             AND payment.kind = 'RECEIPT'
         ), 0) AS allocated_paid
  FROM "Order" AS orders
  WHERE orders."documentType" = 'ORDER' AND orders."isReturn" = false
)
INSERT INTO "invoices" (
  "id", "invoiceNumber", "customerId", "orderId", "sourceType", "status",
  "issueDate", "dueDate", "subtotal", "discountAmount", "taxAmount",
  "totalAmount", "paidAmount", "balanceDue", "paymentTermsDays", "postedAt",
  "voidedAt", "voidReason", "createdById", "postedById", "createdAt", "updatedAt"
)
SELECT
  'invoice-order-' || orders."id",
  'INV-' || lpad(orders.invoice_position::text, 6, '0'),
  orders."customerId",
  orders."id",
  'ORDER',
  CASE
    WHEN orders.status = 'CANCELLED' AND orders.allocated_paid = 0 AND orders."writeOffAmount" = 0 THEN 'VOID'
    WHEN orders.allocated_paid + orders."writeOffAmount" >= orders."totalAmount" THEN 'PAID'
    WHEN orders.allocated_paid + orders."writeOffAmount" > 0 THEN 'PARTIAL'
    ELSE 'OPEN'
  END,
  orders."createdAt",
  CASE
    WHEN orders."deliveryDate" IS NOT NULL AND orders."deliveryDate" > orders."createdAt"
      THEN orders."deliveryDate"
    ELSE orders."createdAt" + INTERVAL '7 days'
  END,
  orders.subtotal,
  orders.discount + orders."couponDiscount" + orders."loyaltyDiscount",
  0,
  orders."totalAmount",
  orders.allocated_paid,
  CASE
    WHEN orders.status = 'CANCELLED' AND orders.allocated_paid = 0 AND orders."writeOffAmount" = 0 THEN 0
    ELSE GREATEST(orders."totalAmount" - orders.allocated_paid - orders."writeOffAmount", 0)
  END,
  7,
  orders."createdAt",
  CASE WHEN orders.status = 'CANCELLED' AND orders.allocated_paid = 0 AND orders."writeOffAmount" = 0 THEN orders."updatedAt" END,
  CASE WHEN orders.status = 'CANCELLED' AND orders.allocated_paid = 0 AND orders."writeOffAmount" = 0 THEN 'Legacy cancelled order migrated as void' END,
  orders."assignedToId",
  orders."assignedToId",
  orders."createdAt",
  orders."updatedAt"
FROM ordered_orders AS orders;

INSERT INTO "invoice_lines" (
  "id", "invoiceId", "orderItemId", "lineType", "description", "quantity",
  "unitPrice", "discountAmount", "taxAmount", "lineTotal", "metadata", "createdAt"
)
SELECT
  'invoice-line-order-' || item."id",
  'invoice-order-' || item."orderId",
  item."id",
  'SERVICE',
  concat_ws(' - ', item."serviceName", nullif(item.variant, ''), nullif(item."garmentType", '')),
  item.quantity,
  item."unitPrice",
  item."lineDiscountAmount",
  0,
  item.subtotal,
  jsonb_build_object(
    'serviceId', item."serviceId",
    'baseUnitPrice', item."baseUnitPrice",
    'priceSource', item."priceSource",
    'upcharges', item.upcharges,
    'notes', item.notes,
    'migratedAt', CURRENT_TIMESTAMP
  ),
  item."createdAt"
FROM "OrderItem" AS item
JOIN "Order" AS orders ON orders."id" = item."orderId"
WHERE orders."documentType" = 'ORDER' AND orders."isReturn" = false;

-- Daily Iron bills enter the same receivable ledger. Existing aggregate paid
-- values become explicit receipt and allocation rows so future reports do not
-- rely on a disconnected mutable cache.
WITH invoice_offset AS (
  SELECT count(*)::bigint AS value FROM "invoices"
), ordered_bills AS (
  SELECT bill.*,
         row_number() OVER (ORDER BY bill."billingPeriodEnd", bill."createdAt", bill."id") AS invoice_position
  FROM "iron_bills" AS bill
)
INSERT INTO "invoices" (
  "id", "invoiceNumber", "customerId", "ironBillId", "sourceType", "status",
  "issueDate", "dueDate", "subtotal", "discountAmount", "taxAmount",
  "totalAmount", "paidAmount", "balanceDue", "paymentTermsDays", "postedAt",
  "createdAt", "updatedAt"
)
SELECT
  'invoice-iron-' || bill."id",
  'INV-' || lpad((invoice_offset.value + bill.invoice_position)::text, 6, '0'),
  bill."customerId",
  bill."id",
  'DAILY_IRON',
  CASE
    WHEN bill."paidAmount" >= bill."totalAmount" THEN 'PAID'
    WHEN bill."paidAmount" > 0 THEN 'PARTIAL'
    ELSE 'OPEN'
  END,
  bill."billingPeriodEnd",
  bill."billingPeriodEnd" + INTERVAL '7 days',
  bill."totalAmount",
  0,
  0,
  bill."totalAmount",
  bill."paidAmount",
  GREATEST(bill."totalAmount" - bill."paidAmount", 0),
  7,
  bill."createdAt",
  bill."createdAt",
  bill."updatedAt"
FROM ordered_bills AS bill
CROSS JOIN invoice_offset;

INSERT INTO "invoice_lines" (
  "id", "invoiceId", "lineType", "description", "quantity", "unitPrice",
  "discountAmount", "taxAmount", "lineTotal", "metadata", "createdAt"
)
SELECT
  'invoice-line-iron-' || log."id",
  'invoice-iron-' || log."billId",
  'DAILY_IRON_USAGE',
  log."serviceName" || ' - ' || to_char(log.date, 'YYYY-MM-DD'),
  log.pieces,
  log."ratePerPiece",
  0,
  0,
  log.amount,
  jsonb_build_object('ironLogId', log."id", 'serviceId', log."serviceId", 'serviceDate', log.date),
  log."createdAt"
FROM "iron_logs" AS log
WHERE log."billId" IS NOT NULL;

INSERT INTO "Payment" (
  "id", "orderId", "customerId", amount, kind, method, status, notes,
  "idempotencyKey", "createdAt"
)
SELECT
  'legacy-iron-payment-' || bill."id",
  NULL,
  bill."customerId",
  bill."paidAmount",
  'RECEIPT',
  COALESCE(nullif(upper(bill."paymentMethod"), ''), 'OTHER'),
  'CAPTURED',
  'Legacy Daily Iron paid balance migrated into the canonical payment ledger',
  'legacy-iron-payment:' || bill."id",
  COALESCE(bill."paidAt", bill."updatedAt")
FROM "iron_bills" AS bill
WHERE bill."paidAmount" > 0;

INSERT INTO "payment_allocations" (
  "id", "paymentId", "orderId", "invoiceId", amount, status, reason, "createdAt"
)
SELECT
  'legacy-iron-allocation-' || bill."id",
  'legacy-iron-payment-' || bill."id",
  NULL,
  'invoice-iron-' || bill."id",
  bill."paidAmount",
  'POSTED',
  'Legacy Daily Iron receipt allocation',
  COALESCE(bill."paidAt", bill."updatedAt")
FROM "iron_bills" AS bill
WHERE bill."paidAmount" > 0;

UPDATE "payment_allocations" AS allocation
SET "invoiceId" = invoice."id"
FROM "invoices" AS invoice
WHERE allocation."invoiceId" IS NULL
  AND allocation."orderId" = invoice."orderId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "payment_allocations" WHERE "invoiceId" IS NULL) THEN
    RAISE EXCEPTION 'Payment allocation could not be linked to a canonical invoice';
  END IF;
END $$;

ALTER TABLE "payment_allocations" ALTER COLUMN "invoiceId" SET NOT NULL;

-- Seed atomic document sequences above all migrated human-readable numbers.
INSERT INTO "document_sequences" (
  "id", "sequenceKey", scope, "documentType", period, "nextValue", "createdAt", "updatedAt"
)
VALUES
  ('sequence-DEFAULT:ORDER:ALL', 'DEFAULT:ORDER:ALL', 'DEFAULT', 'ORDER', 'ALL',
    COALESCE((SELECT max((regexp_match("orderNumber", '^HCS-([0-9]+)'))[1]::bigint) FROM "Order" WHERE "documentType" = 'ORDER'), 0) + 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sequence-DEFAULT:QUOTATION:ALL', 'DEFAULT:QUOTATION:ALL', 'DEFAULT', 'QUOTATION', 'ALL',
    COALESCE((SELECT max((regexp_match("orderNumber", '^HCS-Q([0-9]+)'))[1]::bigint) FROM "Order" WHERE "documentType" = 'QUOTATION'), 0) + 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sequence-DEFAULT:INVOICE:ALL', 'DEFAULT:INVOICE:ALL', 'DEFAULT', 'INVOICE', 'ALL',
    (SELECT count(*)::bigint + 1 FROM "invoices"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sequence-DEFAULT:DELIVERY_CHALLAN:ALL', 'DEFAULT:DELIVERY_CHALLAN:ALL', 'DEFAULT', 'DELIVERY_CHALLAN', 'ALL',
    COALESCE((SELECT max((regexp_match("challanNo", '^DINV-([0-9]+)'))[1]::bigint) FROM "delivery_challans"), 0) + 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sequence-DEFAULT:VENDOR_BILL:ALL', 'DEFAULT:VENDOR_BILL:ALL', 'DEFAULT', 'VENDOR_BILL', 'ALL',
    COALESCE((SELECT max((regexp_match("billNo", '^VB([0-9]+)'))[1]::bigint) FROM "vendor_bills"), 0) + 1,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "document_sequences" (
  "id", "sequenceKey", scope, "documentType", period, "nextValue", "createdAt", "updatedAt"
)
SELECT
  'sequence-DEFAULT:IRON_BILL:' || to_char(bill."billingPeriodEnd", 'YYYY-MM'),
  'DEFAULT:IRON_BILL:' || to_char(bill."billingPeriodEnd", 'YYYY-MM'),
  'DEFAULT',
  'IRON_BILL',
  to_char(bill."billingPeriodEnd", 'YYYY-MM'),
  max(COALESCE((regexp_match(bill."billNumber", '-([0-9]+)$'))[1]::bigint, 0)) + 1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "iron_bills" AS bill
GROUP BY to_char(bill."billingPeriodEnd", 'YYYY-MM');

-- Retain unmatched historical text staff identifiers as text evidence while
-- preventing them from blocking the new foreign key.
UPDATE "cash_book" AS entry
SET "staffId" = NULL
WHERE entry."staffId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM staff WHERE staff."id" = entry."staffId");

WITH ranked_defaults AS (
  SELECT id, row_number() OVER (PARTITION BY "customerId" ORDER BY "createdAt" DESC, id DESC) AS position
  FROM addresses
  WHERE "isDefault" = true
)
UPDATE addresses
SET "isDefault" = false
WHERE id IN (SELECT id FROM ranked_defaults WHERE position > 1);

CREATE UNIQUE INDEX "addresses_one_default_per_customer_idx"
  ON addresses ("customerId")
  WHERE "isDefault" = true;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_ironBillId_key" ON "invoices"("ironBillId");

-- CreateIndex
CREATE INDEX "invoices_customerId_status_dueDate_idx" ON "invoices"("customerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_issueDate_idx" ON "invoices"("issueDate");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_orderItemId_idx" ON "invoice_lines"("orderItemId");

-- CreateIndex
CREATE INDEX "invoice_revisions_createdAt_idx" ON "invoice_revisions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_revisions_invoiceId_version_key" ON "invoice_revisions"("invoiceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextAttemptAt_idx" ON "outbox_events"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "outbox_events_createdAt_idx" ON "outbox_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_scheduleKey_key" ON "reconciliation_runs"("scheduleKey");

-- CreateIndex
CREATE INDEX "reconciliation_runs_runType_startedAt_idx" ON "reconciliation_runs"("runType", "startedAt");

-- CreateIndex
CREATE INDEX "reconciliation_runs_status_startedAt_idx" ON "reconciliation_runs"("status", "startedAt");

-- CreateIndex
CREATE INDEX "worker_heartbeats_status_lastSeenAt_idx" ON "worker_heartbeats"("status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "worker_heartbeats_workerName_instanceId_key" ON "worker_heartbeats"("workerName", "instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_sequenceKey_key" ON "document_sequences"("sequenceKey");

-- CreateIndex
CREATE INDEX "document_sequences_scope_documentType_period_idx" ON "document_sequences"("scope", "documentType", "period");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_status_idx" ON "payment_allocations"("invoiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_invoiceId_key" ON "payment_allocations"("paymentId", "invoiceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_ironBillId_fkey" FOREIGN KEY ("ironBillId") REFERENCES "iron_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_revisions" ADD CONSTRAINT "invoice_revisions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_revisions" ADD CONSTRAINT "invoice_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_book" ADD CONSTRAINT "cash_book_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database invariants protect finance and worker tables from direct SQL/import
-- paths that bypass application validation.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_source_check" CHECK (
    ("sourceType" = 'ORDER' AND "orderId" IS NOT NULL AND "ironBillId" IS NULL) OR
    ("sourceType" = 'DAILY_IRON' AND "ironBillId" IS NOT NULL AND "orderId" IS NULL)
  ),
  ADD CONSTRAINT "invoices_status_check" CHECK ("status" IN ('OPEN', 'PARTIAL', 'PAID', 'VOID')),
  ADD CONSTRAINT "invoices_amounts_check" CHECK (
    subtotal >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND
    "totalAmount" >= 0 AND "paidAmount" >= 0 AND "balanceDue" >= 0 AND
    "paidAmount" <= "totalAmount" AND "balanceDue" <= "totalAmount"
  ),
  ADD CONSTRAINT "invoices_terms_check" CHECK ("paymentTermsDays" >= 0 AND version > 0);

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_values_check" CHECK (
    quantity > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND
    "taxAmount" >= 0 AND "lineTotal" >= 0
  );

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_status_check" CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED', 'PROCESSED', 'DEAD')),
  ADD CONSTRAINT "outbox_events_attempts_check" CHECK (attempts >= 0);

ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "reconciliation_runs_status_check" CHECK (status IN ('RUNNING', 'PASSED', 'FAILED', 'ERROR'));

ALTER TABLE "worker_heartbeats"
  ADD CONSTRAINT "worker_heartbeats_status_check" CHECK (status IN ('RUNNING', 'STOPPING', 'STOPPED', 'FAILED'));

ALTER TABLE "document_sequences"
  ADD CONSTRAINT "document_sequences_next_value_check" CHECK ("nextValue" > 0);

ALTER TABLE "cash_book"
  ADD CONSTRAINT "cash_book_amount_positive_check" CHECK (amount > 0),
  ADD CONSTRAINT "cash_book_type_check" CHECK (type IN ('OPEN', 'CLOSE', 'IN', 'OUT'));

ALTER TABLE expenses
  ADD CONSTRAINT "expenses_amount_positive_check" CHECK (amount > 0),
  ADD CONSTRAINT "expenses_status_check" CHECK (status IN ('PENDING_APPROVAL', 'POSTED', 'VOIDED'));
