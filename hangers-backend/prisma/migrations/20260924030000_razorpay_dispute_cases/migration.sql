CREATE TABLE "razorpay_dispute_cases" (
  "id" TEXT NOT NULL,
  "providerDisputeId" TEXT NOT NULL,
  "providerPaymentId" TEXT NOT NULL,
  "localPaymentId" TEXT,
  "amountPaise" BIGINT NOT NULL,
  "amountDeductedPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "linkStatus" TEXT NOT NULL,
  "phase" TEXT,
  "reasonCode" TEXT,
  "respondBy" TIMESTAMP(3),
  "providerCreatedAt" TIMESTAMP(3),
  "lastEventId" TEXT,
  "mode" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_dispute_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "razorpay_dispute_cases_localPaymentId_fkey"
    FOREIGN KEY ("localPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "razorpay_dispute_cases_providerDisputeId_key"
  ON "razorpay_dispute_cases"("providerDisputeId");
CREATE INDEX "razorpay_dispute_cases_status_respondBy_idx"
  ON "razorpay_dispute_cases"("status", "respondBy");
CREATE INDEX "razorpay_dispute_cases_providerPaymentId_idx"
  ON "razorpay_dispute_cases"("providerPaymentId");
CREATE INDEX "razorpay_dispute_cases_localPaymentId_status_idx"
  ON "razorpay_dispute_cases"("localPaymentId", "status");
