CREATE TABLE "public_share_tokens" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "accessCount" INTEGER NOT NULL DEFAULT 0,
  "lastAccessAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "public_share_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_share_tokens_tokenHash_key" ON "public_share_tokens"("tokenHash");
CREATE INDEX "public_share_tokens_resourceType_resourceId_purpose_idx" ON "public_share_tokens"("resourceType", "resourceId", "purpose");
CREATE INDEX "public_share_tokens_expiresAt_idx" ON "public_share_tokens"("expiresAt");
