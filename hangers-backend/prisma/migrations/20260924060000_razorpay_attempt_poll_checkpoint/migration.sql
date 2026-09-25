ALTER TABLE "razorpay_checkout_attempts"
  ADD COLUMN "nextProviderCheckAt" TIMESTAMP(3);

CREATE INDEX "razorpay_checkout_attempts_mode_status_next_provider_check_idx"
  ON "razorpay_checkout_attempts"("mode", "status", "nextProviderCheckAt");
