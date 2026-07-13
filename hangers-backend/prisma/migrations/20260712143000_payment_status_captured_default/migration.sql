-- CRM payment rows are created only after money is received. Pending/initiated
-- provider states must not be counted as collected money in reports.
UPDATE "Payment"
SET "status" = 'CAPTURED'
WHERE "status" IS NULL OR UPPER("status") = 'PENDING';

UPDATE "Payment"
SET "status" = 'CAPTURED'
WHERE UPPER("status") = 'SUCCESS';

ALTER TABLE "Payment"
ALTER COLUMN "status" SET DEFAULT 'CAPTURED';
