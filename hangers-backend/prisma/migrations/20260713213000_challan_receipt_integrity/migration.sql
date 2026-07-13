-- AlterTable
ALTER TABLE "challan_orders" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "delivery_challans" ADD COLUMN     "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

UPDATE delivery_challans
SET "dispatchedAt" = "createdAt",
    "processedAt" = CASE WHEN status IN ('PROCESSED', 'PARTIAL', 'RECEIVED') THEN "updatedAt" END,
    "receivedAt" = CASE WHEN status = 'RECEIVED' THEN "updatedAt" END;

UPDATE challan_orders AS membership
SET status = CASE WHEN challan.status = 'RECEIVED' THEN 'CLOSED' ELSE 'ACTIVE' END,
    "closedAt" = CASE WHEN challan.status = 'RECEIVED' THEN challan."updatedAt" END
FROM delivery_challans AS challan
WHERE challan.id = membership."challanId";

DO $$
BEGIN
  IF EXISTS (
    SELECT "orderId" FROM challan_orders WHERE status = 'ACTIVE'
    GROUP BY "orderId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Orders linked to multiple active challans require review before migration';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "challan_receipts" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "receiptNo" INTEGER NOT NULL,
    "receivedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challan_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challan_receipt_lines" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "challanItemId" TEXT NOT NULL,
    "previousQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "deltaQty" INTEGER NOT NULL,
    "discrepancyQty" INTEGER NOT NULL DEFAULT 0,
    "discrepancyCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challan_receipt_lines_pkey" PRIMARY KEY ("id")
);

DO $$
DECLARE
  fallback_staff_id TEXT;
BEGIN
  SELECT id INTO fallback_staff_id FROM staff ORDER BY "createdAt" LIMIT 1;
  IF EXISTS (SELECT 1 FROM challan_items WHERE "receivedQty" > 0) AND fallback_staff_id IS NULL THEN
    RAISE EXCEPTION 'Cannot migrate historical challan receipts without a staff audit actor';
  END IF;

  INSERT INTO challan_receipts (
    id, "challanId", "receiptNo", "receivedById", notes, "createdAt"
  )
  SELECT
    'legacy-challan-receipt-' || challan.id,
    challan.id,
    1,
    fallback_staff_id,
    'Historical received quantities migrated into an immutable receipt event',
    COALESCE(challan."receivedAt", challan."updatedAt")
  FROM delivery_challans AS challan
  WHERE EXISTS (SELECT 1 FROM challan_items WHERE "challanId" = challan.id AND "receivedQty" > 0);
END $$;

INSERT INTO challan_receipt_lines (
  id, "receiptId", "challanItemId", "previousQty", "receivedQty", "deltaQty",
  "discrepancyQty", "discrepancyCode", notes, "createdAt"
)
SELECT
  'legacy-challan-receipt-line-' || item.id,
  'legacy-challan-receipt-' || item."challanId",
  item.id,
  0,
  item."receivedQty",
  item."receivedQty",
  GREATEST(item.quantity - item."receivedQty", 0),
  CASE WHEN item."receivedQty" < item.quantity THEN 'LEGACY_SHORT_RECEIPT' END,
  'Historical receipt snapshot',
  COALESCE(item."receivedAt", item."createdAt")
FROM challan_items AS item
WHERE item."receivedQty" > 0;

CREATE UNIQUE INDEX "challan_orders_one_active_per_order_idx"
  ON challan_orders ("orderId") WHERE status = 'ACTIVE';

-- CreateIndex
CREATE INDEX "challan_receipts_createdAt_idx" ON "challan_receipts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "challan_receipts_challanId_receiptNo_key" ON "challan_receipts"("challanId", "receiptNo");

-- CreateIndex
CREATE INDEX "challan_receipt_lines_challanItemId_createdAt_idx" ON "challan_receipt_lines"("challanItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "challan_receipt_lines_receiptId_challanItemId_key" ON "challan_receipt_lines"("receiptId", "challanItemId");

-- CreateIndex
CREATE INDEX "challan_orders_orderId_status_idx" ON "challan_orders"("orderId", "status");

-- AddForeignKey
ALTER TABLE "challan_receipts" ADD CONSTRAINT "challan_receipts_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_receipts" ADD CONSTRAINT "challan_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_receipt_lines" ADD CONSTRAINT "challan_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "challan_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_receipt_lines" ADD CONSTRAINT "challan_receipt_lines_challanItemId_fkey" FOREIGN KEY ("challanItemId") REFERENCES "challan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE delivery_challans
  ADD CONSTRAINT "delivery_challans_status_check" CHECK (status IN ('DRAFT', 'DISPATCHED', 'PROCESSED', 'PARTIAL', 'RECEIVED')),
  ADD CONSTRAINT "delivery_challans_version_check" CHECK (version > 0);

ALTER TABLE challan_orders
  ADD CONSTRAINT "challan_orders_status_check" CHECK (status IN ('ACTIVE', 'CLOSED')),
  ADD CONSTRAINT "challan_orders_closed_state_check" CHECK (
    (status = 'CLOSED' AND "closedAt" IS NOT NULL) OR status = 'ACTIVE'
  );

ALTER TABLE challan_items
  ADD CONSTRAINT "challan_items_quantity_check" CHECK (
    quantity > 0 AND "receivedQty" >= 0 AND "receivedQty" <= quantity AND
    "customerPrice" >= 0 AND "vendorCost" >= 0
  );

ALTER TABLE challan_receipt_lines
  ADD CONSTRAINT "challan_receipt_lines_quantity_check" CHECK (
    "previousQty" >= 0 AND "receivedQty" >= "previousQty" AND
    "deltaQty" = "receivedQty" - "previousQty" AND "deltaQty" > 0 AND
    "discrepancyQty" >= 0
  );
