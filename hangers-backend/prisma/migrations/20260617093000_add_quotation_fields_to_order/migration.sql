-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'ORDER',
ADD COLUMN "quotationStatus" TEXT,
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "convertedOrderId" TEXT;

-- CreateIndex
CREATE INDEX "Order_documentType_idx" ON "Order"("documentType");

-- CreateIndex
CREATE INDEX "Order_quotationStatus_idx" ON "Order"("quotationStatus");
