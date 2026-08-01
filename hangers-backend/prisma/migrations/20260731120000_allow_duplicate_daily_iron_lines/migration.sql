-- Allow separate Daily Iron log lines for the same customer, service, and date.
-- This supports valid counter cases such as one Shirt at one rate and another
-- Shirt at a different manual rate/reason on the same service date.
DROP INDEX IF EXISTS "iron_logs_customerId_serviceId_date_key";

CREATE INDEX IF NOT EXISTS "iron_logs_customerId_serviceId_date_idx"
  ON "iron_logs"("customerId", "serviceId", "date");
