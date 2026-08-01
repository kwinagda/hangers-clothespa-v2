ALTER TABLE "service_appointments"
  ADD COLUMN IF NOT EXISTS "addressId" TEXT,
  ADD COLUMN IF NOT EXISTS "addressSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "service_appointments_addressId_idx"
  ON "service_appointments"("addressId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_addressId_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_addressId_fkey"
      FOREIGN KEY ("addressId") REFERENCES "addresses"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
