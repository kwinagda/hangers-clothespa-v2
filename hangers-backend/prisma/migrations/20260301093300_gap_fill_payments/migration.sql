-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "pickupAddress" TEXT,
ADD COLUMN     "pickupSlot" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectedBy" TEXT,
ALTER COLUMN "method" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedBy_fkey" FOREIGN KEY ("collectedBy") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
