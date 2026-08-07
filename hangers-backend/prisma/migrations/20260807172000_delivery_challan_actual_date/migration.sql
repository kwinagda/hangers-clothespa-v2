ALTER TABLE "delivery_challans" ADD COLUMN "challanDate" TIMESTAMP(3);

UPDATE "delivery_challans"
SET "challanDate" = COALESCE("dispatchedAt", "createdAt");

ALTER TABLE "delivery_challans"
ALTER COLUMN "challanDate" SET NOT NULL,
ALTER COLUMN "challanDate" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "delivery_challans_challanDate_idx" ON "delivery_challans"("challanDate");
