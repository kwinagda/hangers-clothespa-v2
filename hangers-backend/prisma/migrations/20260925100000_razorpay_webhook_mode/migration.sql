ALTER TABLE "razorpay_webhook_events"
  ADD COLUMN "mode" TEXT;

CREATE INDEX "razorpay_webhook_events_mode_status_nextAttemptAt_idx"
  ON "razorpay_webhook_events"("mode", "status", "nextAttemptAt");
