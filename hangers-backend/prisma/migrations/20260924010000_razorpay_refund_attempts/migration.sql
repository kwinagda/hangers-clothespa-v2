ALTER TABLE "Payment"
  ADD COLUMN "razorpayRefundId" TEXT;

CREATE UNIQUE INDEX "Payment_razorpayRefundId_key"
  ON "Payment"("razorpayRefundId");

ALTER TABLE "razorpay_webhook_events"
  ADD COLUMN "refundAttemptId" TEXT;

CREATE TABLE "razorpay_refund_attempts" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "providerIdempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "sourcePaymentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "providerStatus" TEXT,
  "razorpayRefundId" TEXT,
  "localRefundPaymentId" TEXT,
  "creditNoteId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "razorpay_refund_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "razorpay_refund_attempts_sourcePaymentId_fkey"
    FOREIGN KEY ("sourcePaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "razorpay_refund_attempts_localRefundPaymentId_fkey"
    FOREIGN KEY ("localRefundPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "razorpay_refund_attempts_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "razorpay_refund_attempts_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "razorpay_refund_attempts_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "razorpay_refund_attempts_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "razorpay_refund_attempts_idempotencyKey_key"
  ON "razorpay_refund_attempts"("idempotencyKey");
CREATE UNIQUE INDEX "razorpay_refund_attempts_providerIdempotencyKey_key"
  ON "razorpay_refund_attempts"("providerIdempotencyKey");
CREATE UNIQUE INDEX "razorpay_refund_attempts_razorpayRefundId_key"
  ON "razorpay_refund_attempts"("razorpayRefundId");
CREATE UNIQUE INDEX "razorpay_refund_attempts_localRefundPaymentId_key"
  ON "razorpay_refund_attempts"("localRefundPaymentId");
CREATE INDEX "razorpay_refund_attempts_sourcePaymentId_status_createdAt_idx"
  ON "razorpay_refund_attempts"("sourcePaymentId", "status", "createdAt");
CREATE INDEX "razorpay_refund_attempts_invoiceId_status_createdAt_idx"
  ON "razorpay_refund_attempts"("invoiceId", "status", "createdAt");
CREATE INDEX "razorpay_refund_attempts_orderId_createdAt_idx"
  ON "razorpay_refund_attempts"("orderId", "createdAt");
CREATE INDEX "razorpay_refund_attempts_status_updatedAt_idx"
  ON "razorpay_refund_attempts"("status", "updatedAt");
