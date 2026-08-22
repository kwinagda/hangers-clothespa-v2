ALTER TABLE "website_pickup_requests"
  ADD COLUMN "requestNumber" TEXT,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "handledById" TEXT,
  ADD COLUMN "handledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledReason" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS sequence_value
  FROM "website_pickup_requests"
)
UPDATE "website_pickup_requests" AS request
SET "requestNumber" = 'PR-' || LPAD(numbered.sequence_value::TEXT, 3, '0')
FROM numbered
WHERE request."id" = numbered."id";

ALTER TABLE "website_pickup_requests" ALTER COLUMN "requestNumber" SET NOT NULL;

CREATE UNIQUE INDEX "website_pickup_requests_requestNumber_key" ON "website_pickup_requests"("requestNumber");
CREATE UNIQUE INDEX "website_pickup_requests_orderId_key" ON "website_pickup_requests"("orderId");
CREATE INDEX "website_pickup_requests_customerId_idx" ON "website_pickup_requests"("customerId");
CREATE INDEX "website_pickup_requests_handledById_idx" ON "website_pickup_requests"("handledById");

ALTER TABLE "website_pickup_requests" ADD CONSTRAINT "website_pickup_requests_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "website_pickup_requests" ADD CONSTRAINT "website_pickup_requests_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "website_pickup_requests" ADD CONSTRAINT "website_pickup_requests_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "document_sequences" ("id", "sequenceKey", "scope", "documentType", "period", "nextValue", "createdAt", "updatedAt")
VALUES (
  'sequence-website-pickup-request',
  'DEFAULT:WEBSITE_PICKUP_REQUEST:ALL',
  'DEFAULT',
  'WEBSITE_PICKUP_REQUEST',
  'ALL',
  (SELECT COUNT(*) + 1 FROM "website_pickup_requests"),
  NOW(),
  NOW()
)
ON CONFLICT ("sequenceKey") DO UPDATE
SET "nextValue" = GREATEST("document_sequences"."nextValue", EXCLUDED."nextValue"), "updatedAt" = NOW();
