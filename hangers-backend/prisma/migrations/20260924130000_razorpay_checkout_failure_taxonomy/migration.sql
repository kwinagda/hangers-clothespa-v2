ALTER TABLE "razorpay_checkout_attempts"
  ADD COLUMN "providerMethod" TEXT,
  ADD COLUMN "providerMethodDetail" TEXT,
  ADD COLUMN "providerErrorCode" TEXT,
  ADD COLUMN "providerErrorSource" TEXT,
  ADD COLUMN "providerErrorStep" TEXT,
  ADD COLUMN "providerErrorReason" TEXT;
