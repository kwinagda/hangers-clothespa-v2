CREATE INDEX "razorpay_checkout_attempts_analytics_idx"
ON "razorpay_checkout_attempts"("createdAt", "mode", "providerMethod", "status");
