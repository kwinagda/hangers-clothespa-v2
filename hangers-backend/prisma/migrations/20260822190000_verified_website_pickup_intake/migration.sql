ALTER TYPE "AuthChallengePurpose" ADD VALUE IF NOT EXISTS 'WEBSITE_PICKUP_REQUEST';

ALTER TABLE "website_pickup_requests"
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "landmark" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "pincode" TEXT,
  ADD COLUMN "items" JSONB,
  ADD COLUMN "verificationChallengeId" TEXT,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "website_pickup_requests_verificationChallengeId_key"
  ON "website_pickup_requests"("verificationChallengeId");

ALTER TABLE "website_pickup_requests"
  ADD CONSTRAINT "website_pickup_requests_verificationChallengeId_fkey"
  FOREIGN KEY ("verificationChallengeId") REFERENCES "auth_challenges"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
