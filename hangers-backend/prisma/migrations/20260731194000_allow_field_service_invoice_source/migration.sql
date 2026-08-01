ALTER TABLE "invoices"
  DROP CONSTRAINT IF EXISTS "invoices_source_check";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_source_check" CHECK (
    (
      "sourceType" = 'ORDER'
      AND "orderId" IS NOT NULL
      AND "ironBillId" IS NULL
      AND "serviceAppointmentId" IS NULL
    ) OR (
      "sourceType" = 'DAILY_IRON'
      AND "ironBillId" IS NOT NULL
      AND "orderId" IS NULL
      AND "serviceAppointmentId" IS NULL
    ) OR (
      "sourceType" = 'FIELD_SERVICE'
      AND "serviceAppointmentId" IS NOT NULL
      AND "orderId" IS NULL
      AND "ironBillId" IS NULL
    )
  );
