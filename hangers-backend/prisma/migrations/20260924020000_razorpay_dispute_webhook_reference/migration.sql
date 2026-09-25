ALTER TABLE "razorpay_webhook_events"
  ADD COLUMN "disputeId" TEXT;

CREATE INDEX "razorpay_webhook_events_disputeId_idx"
  ON "razorpay_webhook_events"("disputeId");
