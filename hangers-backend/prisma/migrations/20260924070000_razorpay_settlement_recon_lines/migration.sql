CREATE TABLE "razorpay_settlement_recon_lines" (
  "id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "providerEntityId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "providerSettlementId" TEXT,
  "providerPaymentId" TEXT,
  "providerOrderId" TEXT,
  "providerDisputeId" TEXT,
  "currency" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "debitPaise" BIGINT NOT NULL,
  "creditPaise" BIGINT NOT NULL,
  "feePaise" BIGINT NOT NULL,
  "taxPaise" BIGINT NOT NULL,
  "onHold" BOOLEAN NOT NULL DEFAULT false,
  "settled" BOOLEAN NOT NULL DEFAULT false,
  "providerCreatedAt" TIMESTAMP(3),
  "providerSettledAt" TIMESTAMP(3),
  "settlementUtr" TEXT,
  "method" TEXT,
  "description" TEXT,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_settlement_recon_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "razorpay_settlement_recon_lines_mode_entityType_providerEntityId_key"
  ON "razorpay_settlement_recon_lines"("mode", "entityType", "providerEntityId");
CREATE INDEX "razorpay_settlement_recon_lines_mode_providerSettlementId_idx"
  ON "razorpay_settlement_recon_lines"("mode", "providerSettlementId");
CREATE INDEX "razorpay_settlement_recon_lines_mode_providerPaymentId_idx"
  ON "razorpay_settlement_recon_lines"("mode", "providerPaymentId");
CREATE INDEX "razorpay_settlement_recon_lines_mode_settled_providerSettledAt_idx"
  ON "razorpay_settlement_recon_lines"("mode", "settled", "providerSettledAt");
