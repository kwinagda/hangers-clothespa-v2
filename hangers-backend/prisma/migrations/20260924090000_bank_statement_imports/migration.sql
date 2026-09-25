CREATE TABLE "bank_statement_imports" (
  "id" TEXT NOT NULL,
  "accountLabel" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSha256" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL,
  "acceptedRows" INTEGER NOT NULL,
  "rejectedRows" INTEGER NOT NULL,
  "importedBy" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_statement_imports_fileSha256_key"
  ON "bank_statement_imports"("fileSha256");
CREATE INDEX "bank_statement_imports_importedAt_idx"
  ON "bank_statement_imports"("importedAt");

CREATE TABLE "bank_statement_rows" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "transactionDate" TIMESTAMP(3),
  "reference" TEXT,
  "direction" TEXT,
  "amountPaise" BIGINT,
  "balancePaise" BIGINT,
  "currency" TEXT,
  "memo" TEXT,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  CONSTRAINT "bank_statement_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_statement_rows_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "bank_statement_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bank_statement_rows_importId_rowNumber_key"
  ON "bank_statement_rows"("importId", "rowNumber");
CREATE INDEX "bank_statement_rows_status_transactionDate_idx"
  ON "bank_statement_rows"("status", "transactionDate");
CREATE INDEX "bank_statement_rows_reference_idx"
  ON "bank_statement_rows"("reference");
