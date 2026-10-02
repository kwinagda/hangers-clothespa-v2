ALTER TABLE "razorpay_checkout_attempts"
  ADD COLUMN "paymentJourneyId" TEXT;

CREATE INDEX "razorpay_checkout_attempts_paymentJourneyId_createdAt_idx"
  ON "razorpay_checkout_attempts"("paymentJourneyId", "createdAt");

CREATE TABLE "razorpay_payment_journey_events" (
  "id" TEXT NOT NULL,
  "paymentJourneyId" TEXT NOT NULL,
  "checkoutAttemptId" TEXT NOT NULL,
  "requestId" TEXT,
  "traceId" TEXT,
  "spanId" TEXT,
  "eventName" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "priorState" TEXT,
  "nextState" TEXT,
  "invoiceId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "diagnostics" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "razorpay_payment_journey_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "razorpay_payment_journey_events_paymentJourneyId_occurredAt_idx"
  ON "razorpay_payment_journey_events"("paymentJourneyId", "occurredAt");
CREATE INDEX "razorpay_payment_journey_events_checkoutAttemptId_occurredAt_idx"
  ON "razorpay_payment_journey_events"("checkoutAttemptId", "occurredAt");
CREATE INDEX "razorpay_payment_journey_events_requestId_idx"
  ON "razorpay_payment_journey_events"("requestId");
CREATE INDEX "razorpay_payment_journey_events_razorpayOrderId_idx"
  ON "razorpay_payment_journey_events"("razorpayOrderId");
CREATE INDEX "razorpay_payment_journey_events_razorpayPaymentId_idx"
  ON "razorpay_payment_journey_events"("razorpayPaymentId");
