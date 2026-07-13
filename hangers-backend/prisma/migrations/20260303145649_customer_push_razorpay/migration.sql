-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "razorpayPaymentId" TEXT,
ADD COLUMN     "razorpaySignature" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "notifPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifWhatsApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pushToken" TEXT;
