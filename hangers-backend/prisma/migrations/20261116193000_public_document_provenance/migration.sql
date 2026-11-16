ALTER TABLE "public_share_tokens"
  ADD COLUMN "createdByType" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "creationSource" TEXT,
  ADD COLUMN "creationReason" TEXT,
  ADD COLUMN "revokedByType" TEXT,
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT;

CREATE INDEX "public_share_tokens_creationSource_createdAt_idx"
  ON "public_share_tokens"("creationSource", "createdAt");
