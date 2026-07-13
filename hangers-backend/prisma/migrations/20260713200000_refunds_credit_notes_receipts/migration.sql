-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "creditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "refund_allocations" (
    "id" TEXT NOT NULL,
    "refundPaymentId" TEXT NOT NULL,
    "sourceAllocationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "refundPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(18,2) NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "snapshot" JSONB NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "reissueOfId" TEXT,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_allocations" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "paymentAllocationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- Every captured receipt with a posted allocation becomes an immutable,
-- numbered receipt document. Multi-invoice receipts retain each allocation.
WITH receipt_sources AS (
  SELECT
    payment."id" AS payment_id,
    payment."customerId" AS customer_id,
    payment."collectedBy" AS issued_by_id,
    payment."createdAt" AS issued_at,
    payment.amount,
    payment.method,
    payment.reference,
    row_number() OVER (ORDER BY payment."createdAt", payment."id") AS receipt_position,
    count(allocation."id") AS allocation_count,
    min(allocation."invoiceId") AS primary_invoice_id,
    jsonb_agg(jsonb_build_object(
      'allocationId', allocation."id",
      'invoiceId', allocation."invoiceId",
      'invoiceNumber', invoice."invoiceNumber",
      'amount', allocation.amount
    ) ORDER BY allocation."createdAt", allocation."id") AS allocations
  FROM "Payment" AS payment
  JOIN "payment_allocations" AS allocation
    ON allocation."paymentId" = payment."id" AND allocation.status = 'POSTED'
  JOIN invoices AS invoice ON invoice."id" = allocation."invoiceId"
  WHERE payment.kind = 'RECEIPT' AND payment.status IN ('CAPTURED', 'SUCCESS', 'PAID')
  GROUP BY payment."id", payment."customerId", payment."collectedBy", payment."createdAt",
           payment.amount, payment.method, payment.reference
)
INSERT INTO receipts (
  "id", "receiptNumber", "paymentId", "invoiceId", "customerId", status,
  snapshot, "issuedById", "issuedAt", "createdAt"
)
SELECT
  'legacy-receipt-' || source.payment_id,
  'REC-' || lpad(source.receipt_position::text, 6, '0'),
  source.payment_id,
  CASE WHEN source.allocation_count = 1 THEN source.primary_invoice_id END,
  source.customer_id,
  'ISSUED',
  jsonb_build_object(
    'paymentId', source.payment_id,
    'kind', 'RECEIPT',
    'amount', source.amount,
    'method', source.method,
    'reference', source.reference,
    'collectedAt', source.issued_at,
    'allocations', source.allocations,
    'migratedAt', CURRENT_TIMESTAMP
  ),
  source.issued_by_id,
  source.issued_at,
  source.issued_at
FROM receipt_sources AS source;

INSERT INTO receipt_allocations (
  "id", "receiptId", "paymentAllocationId", "invoiceId", amount, "createdAt"
)
SELECT
  'legacy-receipt-allocation-' || allocation."id",
  'legacy-receipt-' || allocation."paymentId",
  allocation."id",
  allocation."invoiceId",
  allocation.amount,
  allocation."createdAt"
FROM "payment_allocations" AS allocation
JOIN receipts AS receipt ON receipt."paymentId" = allocation."paymentId"
WHERE allocation.status = 'POSTED';

INSERT INTO document_sequences (
  "id", "sequenceKey", scope, "documentType", period, "nextValue", "createdAt", "updatedAt"
)
VALUES
  ('sequence-DEFAULT:RECEIPT:ALL', 'DEFAULT:RECEIPT:ALL', 'DEFAULT', 'RECEIPT', 'ALL',
   (SELECT count(*)::bigint + 1 FROM receipts), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sequence-DEFAULT:CREDIT_NOTE:ALL', 'DEFAULT:CREDIT_NOTE:ALL', 'DEFAULT', 'CREDIT_NOTE', 'ALL',
   1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("sequenceKey") DO UPDATE
SET "nextValue" = GREATEST(document_sequences."nextValue", EXCLUDED."nextValue"),
    "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE invoices DROP CONSTRAINT "invoices_status_check";
ALTER TABLE invoices DROP CONSTRAINT "invoices_amounts_check";
ALTER TABLE invoices
  ADD CONSTRAINT "invoices_status_check" CHECK (status IN ('OPEN', 'PARTIAL', 'PAID', 'CREDITED', 'VOID')),
  ADD CONSTRAINT "invoices_amounts_check" CHECK (
    subtotal >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND
    "totalAmount" >= 0 AND "paidAmount" >= 0 AND "creditAmount" >= 0 AND
    "balanceDue" >= 0 AND "paidAmount" <= "totalAmount" AND
    "creditAmount" <= "totalAmount" AND "balanceDue" <= "totalAmount"
  );

-- Link legacy signed refunds to the matching earlier receipt. If that source
-- receipt was unapplied, the refund reverses customer credit and correctly has
-- no invoice credit note or refund allocation.
UPDATE "Payment" AS refund
SET "reversalOfId" = (
      SELECT receipt."id"
      FROM "Payment" AS receipt
      WHERE receipt.kind = 'RECEIPT'
        AND receipt."customerId" = refund."customerId"
        AND receipt."orderId" IS NOT DISTINCT FROM refund."orderId"
        AND receipt.amount = refund.amount
        AND receipt."createdAt" <= refund."createdAt"
        AND NOT EXISTS (
          SELECT 1 FROM "Payment" AS existing_refund
          WHERE existing_refund."reversalOfId" = receipt."id" AND existing_refund."id" <> refund."id"
        )
      ORDER BY receipt."createdAt" DESC, receipt."id" DESC
      LIMIT 1
    ),
    "reversalReason" = COALESCE(refund."reversalReason", 'Legacy refund linked to its source receipt')
WHERE refund.kind = 'REFUND' AND refund."reversalOfId" IS NULL;

-- CreateIndex
CREATE INDEX "refund_allocations_invoiceId_status_idx" ON "refund_allocations"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "refund_allocations_refundPaymentId_status_idx" ON "refund_allocations"("refundPaymentId", "status");

-- CreateIndex
CREATE INDEX "refund_allocations_sourceAllocationId_status_idx" ON "refund_allocations"("sourceAllocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNumber_key" ON "credit_notes"("creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_refundPaymentId_key" ON "credit_notes"("refundPaymentId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_status_idx" ON "credit_notes"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "credit_notes_customerId_createdAt_idx" ON "credit_notes"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_notes_orderId_idx" ON "credit_notes"("orderId");

-- CreateIndex
CREATE INDEX "credit_note_lines_creditNoteId_idx" ON "credit_note_lines"("creditNoteId");

-- CreateIndex
CREATE INDEX "credit_note_lines_invoiceLineId_idx" ON "credit_note_lines"("invoiceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_paymentId_key" ON "receipts"("paymentId");

-- CreateIndex
CREATE INDEX "receipts_customerId_issuedAt_idx" ON "receipts"("customerId", "issuedAt");

-- CreateIndex
CREATE INDEX "receipts_invoiceId_idx" ON "receipts"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_allocations_paymentAllocationId_key" ON "receipt_allocations"("paymentAllocationId");

-- CreateIndex
CREATE INDEX "receipt_allocations_receiptId_idx" ON "receipt_allocations"("receiptId");

-- CreateIndex
CREATE INDEX "receipt_allocations_invoiceId_idx" ON "receipt_allocations"("invoiceId");

-- AddForeignKey
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_refundPaymentId_fkey" FOREIGN KEY ("refundPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_sourceAllocationId_fkey" FOREIGN KEY ("sourceAllocationId") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_allocations" ADD CONSTRAINT "refund_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_refundPaymentId_fkey" FOREIGN KEY ("refundPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reissueOfId_fkey" FOREIGN KEY ("reissueOfId") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_paymentAllocationId_fkey" FOREIGN KEY ("paymentAllocationId") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE refund_allocations
  ADD CONSTRAINT "refund_allocations_amount_positive_check" CHECK (amount > 0),
  ADD CONSTRAINT "refund_allocations_status_check" CHECK (status IN ('POSTED', 'REVERSED'));

ALTER TABLE credit_notes
  ADD CONSTRAINT "credit_notes_amount_positive_check" CHECK (amount > 0),
  ADD CONSTRAINT "credit_notes_status_check" CHECK (status IN ('POSTED', 'VOID'));

ALTER TABLE credit_note_lines
  ADD CONSTRAINT "credit_note_lines_values_check" CHECK (quantity > 0 AND amount > 0);

ALTER TABLE receipts
  ADD CONSTRAINT "receipts_status_check" CHECK (status IN ('ISSUED', 'VOID', 'REISSUED')),
  ADD CONSTRAINT "receipts_print_count_check" CHECK ("printCount" >= 0);

ALTER TABLE receipt_allocations
  ADD CONSTRAINT "receipt_allocations_amount_positive_check" CHECK (amount > 0);
