ALTER TABLE "razorpay_webhook_events"
  ALTER COLUMN "payload" DROP NOT NULL,
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "refundId" TEXT,
  ADD COLUMN "settlementId" TEXT,
  ADD COLUMN "payloadHash" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "razorpay_webhook_events_status_createdAt_idx";
CREATE INDEX "razorpay_webhook_events_status_nextAttemptAt_idx"
  ON "razorpay_webhook_events"("status", "nextAttemptAt");
CREATE INDEX "razorpay_webhook_events_paymentId_idx"
  ON "razorpay_webhook_events"("paymentId");
CREATE INDEX "razorpay_webhook_events_orderId_idx"
  ON "razorpay_webhook_events"("orderId");
CREATE INDEX "razorpay_webhook_events_refundId_idx"
  ON "razorpay_webhook_events"("refundId");
CREATE INDEX "razorpay_webhook_events_settlementId_idx"
  ON "razorpay_webhook_events"("settlementId");

CREATE TABLE "razorpay_checkout_attempts" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "orderId" TEXT,
  "customerId" TEXT NOT NULL,
  "publicShareId" TEXT,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "requestId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_checkout_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "razorpay_checkout_attempts_idempotencyKey_key"
  ON "razorpay_checkout_attempts"("idempotencyKey");
CREATE UNIQUE INDEX "razorpay_checkout_attempts_razorpayOrderId_key"
  ON "razorpay_checkout_attempts"("razorpayOrderId");
CREATE UNIQUE INDEX "razorpay_checkout_attempts_razorpayPaymentId_key"
  ON "razorpay_checkout_attempts"("razorpayPaymentId");
CREATE INDEX "razorpay_checkout_attempts_invoiceId_createdAt_idx"
  ON "razorpay_checkout_attempts"("invoiceId", "createdAt");
CREATE INDEX "razorpay_checkout_attempts_customerId_createdAt_idx"
  ON "razorpay_checkout_attempts"("customerId", "createdAt");
CREATE INDEX "razorpay_checkout_attempts_status_createdAt_idx"
  ON "razorpay_checkout_attempts"("status", "createdAt");
