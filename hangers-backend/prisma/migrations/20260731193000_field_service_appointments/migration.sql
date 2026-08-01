CREATE TABLE IF NOT EXISTS "service_appointments" (
  "id" TEXT NOT NULL,
  "appointmentNumber" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceId" TEXT,
  "serviceName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "assignedToId" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "internalNotes" TEXT,
  "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "pricingSnapshot" JSONB,
  "createdById" TEXT,
  "completedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_appointment_events" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_appointment_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "serviceAppointmentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "service_appointments_appointmentNumber_key"
  ON "service_appointments"("appointmentNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_serviceAppointmentId_key"
  ON "invoices"("serviceAppointmentId");

CREATE INDEX IF NOT EXISTS "service_appointments_customerId_scheduledAt_idx"
  ON "service_appointments"("customerId", "scheduledAt");

CREATE INDEX IF NOT EXISTS "service_appointments_status_scheduledAt_idx"
  ON "service_appointments"("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "service_appointments_assignedToId_status_scheduledAt_idx"
  ON "service_appointments"("assignedToId", "status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "service_appointment_events_appointmentId_createdAt_idx"
  ON "service_appointment_events"("appointmentId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_customerId_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customers"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_serviceId_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_assignedToId_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "staff"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_createdById_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "staff"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointments_completedById_fkey') THEN
    ALTER TABLE "service_appointments"
      ADD CONSTRAINT "service_appointments_completedById_fkey"
      FOREIGN KEY ("completedById") REFERENCES "staff"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_events_appointmentId_fkey') THEN
    ALTER TABLE "service_appointment_events"
      ADD CONSTRAINT "service_appointment_events_appointmentId_fkey"
      FOREIGN KEY ("appointmentId") REFERENCES "service_appointments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_appointment_events_changedById_fkey') THEN
    ALTER TABLE "service_appointment_events"
      ADD CONSTRAINT "service_appointment_events_changedById_fkey"
      FOREIGN KEY ("changedById") REFERENCES "staff"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_serviceAppointmentId_fkey') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_serviceAppointmentId_fkey"
      FOREIGN KEY ("serviceAppointmentId") REFERENCES "service_appointments"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
