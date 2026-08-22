ALTER TABLE "auth_challenges"
ADD COLUMN "verificationTokenHash" TEXT,
ADD COLUMN "verificationTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "verificationTokenConsumedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "auth_challenges_verificationTokenHash_key"
ON "auth_challenges"("verificationTokenHash");
