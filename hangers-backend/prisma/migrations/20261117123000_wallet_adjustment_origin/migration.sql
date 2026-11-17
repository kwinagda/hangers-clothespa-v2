ALTER TABLE "wallet_transactions"
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'SYSTEM';

UPDATE "wallet_transactions"
SET "origin" = 'CRM_MANUAL_ADJUSTMENT'
WHERE "reasonCode" IN ('MANUAL_CREDIT', 'MANUAL_DEBIT');

CREATE UNIQUE INDEX "wallet_transactions_reversalOfId_key"
ON "wallet_transactions"("reversalOfId");
