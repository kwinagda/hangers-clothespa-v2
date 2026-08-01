CREATE TABLE IF NOT EXISTS "service_appointment_lines" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "serviceId" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(18,2) NOT NULL,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_appointment_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_appointment_lines_appointmentId_idx"
  ON "service_appointment_lines"("appointmentId");

CREATE INDEX IF NOT EXISTS "service_appointment_lines_serviceId_idx"
  ON "service_appointment_lines"("serviceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_lines_appointmentId_fkey') THEN
    ALTER TABLE "service_appointment_lines"
      ADD CONSTRAINT "service_appointment_lines_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "service_appointments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_lines_serviceId_fkey') THEN
    ALTER TABLE "service_appointment_lines"
      ADD CONSTRAINT "service_appointment_lines_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_lines_values_check') THEN
    ALTER TABLE "service_appointment_lines"
      ADD CONSTRAINT "service_appointment_lines_values_check"
      CHECK (
        quantity > 0
        AND "unitPrice" >= 0
        AND "discountAmount" >= 0
        AND "lineTotal" >= 0
      );
  END IF;
END $$;

INSERT INTO "service_appointment_lines" (
  "id", "appointmentId", "serviceId", "description", "quantity", "unitPrice",
  "discountAmount", "lineTotal", "metadata", "createdAt"
)
SELECT
  'sal_' || replace(gen_random_uuid()::text, '-', ''),
  appointment."id",
  appointment."serviceId",
  appointment."serviceName",
  1,
  appointment."subtotal",
  appointment."discountAmount",
  appointment."totalAmount",
  jsonb_build_object(
    'source', 'FIELD_SERVICE_LINE_BACKFILL',
    'pricingSnapshot', appointment."pricingSnapshot"
  ),
  appointment."createdAt"
FROM "service_appointments" appointment
WHERE NOT EXISTS (
  SELECT 1
  FROM "service_appointment_lines" line
  WHERE line."appointmentId" = appointment."id"
);
