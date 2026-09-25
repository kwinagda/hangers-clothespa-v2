ALTER TABLE "Payment"
  ADD COLUMN "providerMethod" TEXT,
  ADD COLUMN "providerMethodDetail" TEXT;

CREATE INDEX "Payment_providerMethod_createdAt_idx"
  ON "Payment"("providerMethod", "createdAt");
