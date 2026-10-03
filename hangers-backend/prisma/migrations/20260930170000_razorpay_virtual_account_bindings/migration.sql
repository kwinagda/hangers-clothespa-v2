CREATE TABLE "razorpay_virtual_account_bindings" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "virtualAccountId" TEXT NOT NULL,
  "providerOrderId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "razorpay_virtual_account_bindings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "razorpay_virtual_account_bindings_attemptId_key" ON "razorpay_virtual_account_bindings"("attemptId");
CREATE UNIQUE INDEX "razorpay_virtual_account_bindings_mode_accountId_virtualAcc_key" ON "razorpay_virtual_account_bindings"("mode", "accountId", "virtualAccountId");
