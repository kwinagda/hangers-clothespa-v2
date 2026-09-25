CREATE TABLE "bank_settlement_matches" (
  "id" TEXT NOT NULL,
  "bankStatementRowId" TEXT NOT NULL,
  "settlementSummaryId" TEXT NOT NULL,
  "matchType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'MATCHED',
  "currency" TEXT NOT NULL,
  "statementAmountPaise" BIGINT NOT NULL,
  "settlementAmountPaise" BIGINT NOT NULL,
  "reportNetPaise" BIGINT NOT NULL,
  "variancePaise" BIGINT NOT NULL,
  "reason" TEXT,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedBy" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reverseReason" TEXT,
  CONSTRAINT "bank_settlement_matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_settlement_matches_bankStatementRowId_fkey"
    FOREIGN KEY ("bankStatementRowId") REFERENCES "bank_statement_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bank_settlement_matches_settlementSummaryId_fkey"
    FOREIGN KEY ("settlementSummaryId") REFERENCES "razorpay_settlement_summaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "bank_settlement_matches_status_confirmedAt_idx"
  ON "bank_settlement_matches"("status", "confirmedAt");
CREATE INDEX "bank_settlement_matches_settlementSummaryId_status_idx"
  ON "bank_settlement_matches"("settlementSummaryId", "status");
CREATE INDEX "bank_settlement_matches_bankStatementRowId_status_idx"
  ON "bank_settlement_matches"("bankStatementRowId", "status");
CREATE UNIQUE INDEX "bank_settlement_matches_active_row_key"
  ON "bank_settlement_matches"("bankStatementRowId") WHERE "status" = 'MATCHED';
CREATE UNIQUE INDEX "bank_settlement_matches_active_settlement_key"
  ON "bank_settlement_matches"("settlementSummaryId") WHERE "status" = 'MATCHED';
