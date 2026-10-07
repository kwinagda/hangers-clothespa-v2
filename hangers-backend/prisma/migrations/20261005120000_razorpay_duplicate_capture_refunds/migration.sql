ALTER TABLE "Payment"
  ADD COLUMN "unallocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "razorpay_checkout_attempts"
  ADD COLUMN "supersedesAttemptId" TEXT,
  ADD COLUMN "allocatedAmountPaise" BIGINT,
  ADD COLUMN "unallocatedAmountPaise" BIGINT;

ALTER TABLE "razorpay_refund_attempts"
  ADD COLUMN "checkoutAttemptId" TEXT,
  ALTER COLUMN "orderId" DROP NOT NULL,
  ALTER COLUMN "invoiceId" DROP NOT NULL,
  ALTER COLUMN "createdById" DROP NOT NULL,
  ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "razorpay_refund_attempts_automatic_status_nextAttemptAt_idx"
  ON "razorpay_refund_attempts"("automatic", "status", "nextAttemptAt");
