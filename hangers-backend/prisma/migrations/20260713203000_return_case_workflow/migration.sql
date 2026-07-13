-- CreateTable
CREATE TABLE "return_cases" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "originalOrderId" TEXT NOT NULL,
    "reworkOrderId" TEXT,
    "creditNoteId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'RECLEAN',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reasonCode" TEXT NOT NULL,
    "reasonNarrative" TEXT,
    "responsibility" TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "disposition" TEXT NOT NULL DEFAULT 'RECLEAN',
    "financialResolution" TEXT NOT NULL DEFAULT 'NO_CHARGE_REWORK',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_lines" (
    "id" TEXT NOT NULL,
    "returnCaseId" TEXT NOT NULL,
    "originalOrderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "conditionCode" TEXT,
    "conditionNotes" TEXT,
    "disposition" TEXT NOT NULL DEFAULT 'RECLEAN',
    "responsibility" TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
    "vendorLiabilityAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id")
);

-- Convert historical linked return/re-clean orders into resolved cases. Exact
-- legacy garment selection was not recorded, so original lines are retained as
-- the safest explicit scope and identified as migration evidence.
DO $$
DECLARE
  fallback_staff_id TEXT;
BEGIN
  SELECT id INTO fallback_staff_id FROM staff ORDER BY "createdAt" LIMIT 1;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "isReturn" = true AND "originalOrderId" IS NOT NULL)
     AND fallback_staff_id IS NULL THEN
    RAISE EXCEPTION 'Cannot migrate historical returns without a staff audit actor';
  END IF;

  WITH legacy_returns AS (
    SELECT return_order.*,
           row_number() OVER (ORDER BY return_order."createdAt", return_order.id) AS case_position
    FROM "Order" AS return_order
    WHERE return_order."isReturn" = true AND return_order."originalOrderId" IS NOT NULL
  )
  INSERT INTO return_cases (
    id, "caseNumber", "customerId", "originalOrderId", "reworkOrderId", kind,
    status, "reasonCode", "reasonNarrative", responsibility, disposition,
    "financialResolution", priority, "resolvedAt", "resolutionNotes",
    "createdById", "resolvedById", "createdAt", "updatedAt"
  )
  SELECT
    'legacy-return-case-' || legacy.id,
    'RC-' || lpad(legacy.case_position::text, 6, '0'),
    legacy."customerId",
    legacy."originalOrderId",
    legacy.id,
    'RETURN',
    'RESOLVED',
    'LEGACY_RETURN',
    COALESCE(legacy."returnReason", 'Historical return migrated without a structured reason'),
    'UNDER_REVIEW',
    'RETURN_TO_CUSTOMER',
    'LEGACY_CREDIT_DOCUMENT',
    'NORMAL',
    legacy."updatedAt",
    'Historical return imported into the structured case register',
    COALESCE(legacy."assignedToId", fallback_staff_id),
    COALESCE(legacy."assignedToId", fallback_staff_id),
    legacy."createdAt",
    legacy."updatedAt"
  FROM legacy_returns AS legacy;
END $$;

INSERT INTO return_lines (
  id, "returnCaseId", "originalOrderItemId", quantity, "conditionCode",
  "conditionNotes", disposition, responsibility, "vendorLiabilityAmount", "createdAt"
)
SELECT
  'legacy-return-line-' || return_order.id || '-' || original_item.id,
  'legacy-return-case-' || return_order.id,
  original_item.id,
  original_item.quantity,
  'LEGACY_UNSPECIFIED',
  'Exact historical garment selection was unavailable during structured return migration',
  'RETURN_TO_CUSTOMER',
  'UNDER_REVIEW',
  0,
  return_order."createdAt"
FROM "Order" AS return_order
JOIN "OrderItem" AS original_item ON original_item."orderId" = return_order."originalOrderId"
WHERE return_order."isReturn" = true AND return_order."originalOrderId" IS NOT NULL;

INSERT INTO document_sequences (
  id, "sequenceKey", scope, "documentType", period, "nextValue", "createdAt", "updatedAt"
)
VALUES (
  'sequence-DEFAULT:RETURN_CASE:ALL', 'DEFAULT:RETURN_CASE:ALL', 'DEFAULT',
  'RETURN_CASE', 'ALL', (SELECT count(*)::bigint + 1 FROM return_cases),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("sequenceKey") DO UPDATE
SET "nextValue" = GREATEST(document_sequences."nextValue", EXCLUDED."nextValue"),
    "updatedAt" = CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "return_cases_one_active_per_order_idx"
  ON return_cases ("originalOrderId")
  WHERE status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_RESOLUTION');

-- CreateIndex
CREATE UNIQUE INDEX "return_cases_caseNumber_key" ON "return_cases"("caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "return_cases_reworkOrderId_key" ON "return_cases"("reworkOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "return_cases_creditNoteId_key" ON "return_cases"("creditNoteId");

-- CreateIndex
CREATE INDEX "return_cases_customerId_status_idx" ON "return_cases"("customerId", "status");

-- CreateIndex
CREATE INDEX "return_cases_originalOrderId_status_idx" ON "return_cases"("originalOrderId", "status");

-- CreateIndex
CREATE INDEX "return_cases_status_dueAt_idx" ON "return_cases"("status", "dueAt");

-- CreateIndex
CREATE INDEX "return_lines_originalOrderItemId_idx" ON "return_lines"("originalOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "return_lines_returnCaseId_originalOrderItemId_key" ON "return_lines"("returnCaseId", "originalOrderItemId");

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_reworkOrderId_fkey" FOREIGN KEY ("reworkOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_cases" ADD CONSTRAINT "return_cases_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_returnCaseId_fkey" FOREIGN KEY ("returnCaseId") REFERENCES "return_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_originalOrderItemId_fkey" FOREIGN KEY ("originalOrderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE return_cases
  ADD CONSTRAINT "return_cases_kind_check" CHECK (kind IN ('RECLEAN', 'RETURN', 'DAMAGE')),
  ADD CONSTRAINT "return_cases_status_check" CHECK (status IN ('OPEN', 'IN_PROGRESS', 'AWAITING_RESOLUTION', 'RESOLVED', 'CANCELLED')),
  ADD CONSTRAINT "return_cases_resolved_state_check" CHECK (
    (status = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedById" IS NOT NULL)
    OR status <> 'RESOLVED'
  ),
  ADD CONSTRAINT "return_cases_priority_check" CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));

ALTER TABLE return_lines
  ADD CONSTRAINT "return_lines_values_check" CHECK (quantity > 0 AND "vendorLiabilityAmount" >= 0);
