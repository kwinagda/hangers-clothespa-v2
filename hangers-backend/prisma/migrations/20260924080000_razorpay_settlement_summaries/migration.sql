CREATE TABLE "razorpay_settlement_summaries" (
  "id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "providerSettlementId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "feesPaise" BIGINT NOT NULL,
  "taxPaise" BIGINT NOT NULL,
  "settlementUtr" TEXT,
  "providerCreatedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_settlement_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "razorpay_settlement_summaries_mode_providerSettlementId_key"
  ON "razorpay_settlement_summaries"("mode", "providerSettlementId");
CREATE INDEX "razorpay_settlement_summaries_mode_providerCreatedAt_idx"
  ON "razorpay_settlement_summaries"("mode", "providerCreatedAt");
CREATE INDEX "razorpay_settlement_summaries_mode_status_providerCreatedAt_idx"
  ON "razorpay_settlement_summaries"("mode", "status", "providerCreatedAt");
