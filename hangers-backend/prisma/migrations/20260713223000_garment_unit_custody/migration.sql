CREATE TABLE "garment_units" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "legacyTagNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "brand" TEXT,
    "color" TEXT,
    "conditionNotes" TEXT,
    "specialCare" TEXT,
    "currentPlantPartnerId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "garment_units_pkey" PRIMARY KEY ("id")
);

INSERT INTO "garment_units" ("id", "orderItemId", "sequence", "tagNumber", "legacyTagNumber", "createdAt", "updatedAt")
SELECT 'gu_' || SUBSTR(MD5(i."id" || ':' || seq::TEXT), 1, 22), i."id", seq,
       'HNG-' || UPPER(REGEXP_REPLACE(o."orderNumber", '[^A-Za-z0-9-]+', '-', 'g')) || '-' || UPPER(RIGHT(i."id", 6)) || '-' || LPAD(seq::TEXT, 2, '0'),
       CASE WHEN seq = 1 THEN i."tagNumber" ELSE NULL END,
       i."createdAt" + (seq * INTERVAL '1 millisecond'), i."createdAt"
FROM "OrderItem" i
JOIN "Order" o ON o."id" = i."orderId" AND o."documentType" = 'ORDER'
CROSS JOIN LATERAL GENERATE_SERIES(1, i."quantity") seq;

CREATE TABLE "challan_garment_units" (
    "id" TEXT NOT NULL,
    "challanItemId" TEXT NOT NULL,
    "garmentUnitId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPATCHED',
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "receiptId" TEXT,
    CONSTRAINT "challan_garment_units_pkey" PRIMARY KEY ("id")
);

INSERT INTO "challan_garment_units" ("id", "challanItemId", "garmentUnitId", "status", "dispatchedAt", "receivedAt")
SELECT 'cgu_' || SUBSTR(MD5(ci."id" || ':' || gu."id"), 1, 21), ci."id", gu."id",
       CASE WHEN gu."sequence" <= ci."receivedQty" OR ci."isReceived" THEN 'RECEIVED' ELSE 'DISPATCHED' END,
       dc."dispatchedAt",
       CASE WHEN gu."sequence" <= ci."receivedQty" OR ci."isReceived" THEN COALESCE(ci."receivedAt", dc."receivedAt", dc."updatedAt") ELSE NULL END
FROM "challan_items" ci
JOIN "delivery_challans" dc ON dc."id" = ci."challanId"
JOIN "garment_units" gu ON gu."orderItemId" = ci."orderItemId" AND gu."sequence" <= ci."quantity";

UPDATE "challan_garment_units" movement SET "receiptId" = receipt_match."receiptId"
FROM (
  SELECT movement_inner."id" AS movement_id, (
    SELECT cr."id"
    FROM "challan_receipt_lines" crl
    JOIN "challan_receipts" cr ON cr."id" = crl."receiptId"
    JOIN "garment_units" unit_inner ON unit_inner."id" = movement_inner."garmentUnitId"
    WHERE crl."challanItemId" = movement_inner."challanItemId" AND crl."receivedQty" >= unit_inner."sequence"
    ORDER BY cr."createdAt" ASC LIMIT 1
  ) AS "receiptId"
  FROM "challan_garment_units" movement_inner WHERE movement_inner."status" = 'RECEIVED'
) receipt_match
WHERE movement."id" = receipt_match.movement_id AND receipt_match."receiptId" IS NOT NULL;

WITH latest_movement AS (
  SELECT DISTINCT ON (movement."garmentUnitId") movement."garmentUnitId", movement."status", dc."plantPartnerId"
  FROM "challan_garment_units" movement
  JOIN "challan_items" ci ON ci."id" = movement."challanItemId"
  JOIN "delivery_challans" dc ON dc."id" = ci."challanId"
  ORDER BY movement."garmentUnitId", movement."dispatchedAt" DESC, movement."id" DESC
)
UPDATE "garment_units" unit SET
  "status" = CASE WHEN latest."status" = 'DISPATCHED' THEN 'AT_PLANT' ELSE 'RECEIVED_FROM_PLANT' END,
  "currentPlantPartnerId" = CASE WHEN latest."status" = 'DISPATCHED' THEN latest."plantPartnerId" ELSE NULL END,
  "version" = 2
FROM latest_movement latest WHERE latest."garmentUnitId" = unit."id";

CREATE TABLE "return_garment_units" (
    "id" TEXT NOT NULL,
    "returnLineId" TEXT NOT NULL,
    "garmentUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "return_garment_units_pkey" PRIMARY KEY ("id")
);

INSERT INTO "return_garment_units" ("id", "returnLineId", "garmentUnitId", "createdAt")
SELECT 'rgu_' || SUBSTR(MD5(rl."id" || ':' || gu."id"), 1, 21), rl."id", gu."id", rl."createdAt"
FROM "return_lines" rl
JOIN "garment_units" gu ON gu."orderItemId" = rl."originalOrderItemId" AND gu."sequence" <= rl."quantity";

CREATE TABLE "plant_quality_issues" (
    "id" TEXT NOT NULL,
    "issueNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "garmentUnitId" TEXT,
    "challanId" TEXT,
    "plantPartnerId" TEXT,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "previousUnitStatus" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responsibility" TEXT,
    "resolution" TEXT,
    "reportedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_quality_issues_pkey" PRIMARY KEY ("id")
);

INSERT INTO "document_sequences" ("id", "sequenceKey", "scope", "documentType", "period", "nextValue", "createdAt", "updatedAt")
VALUES ('seq_plant_issue', 'DEFAULT:PLANT_ISSUE:ALL', 'DEFAULT', 'PLANT_ISSUE', 'ALL', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("sequenceKey") DO NOTHING;

CREATE INDEX "return_garment_units_garmentUnitId_createdAt_idx" ON "return_garment_units"("garmentUnitId", "createdAt");
CREATE UNIQUE INDEX "return_garment_units_returnLineId_garmentUnitId_key" ON "return_garment_units"("returnLineId", "garmentUnitId");
CREATE UNIQUE INDEX "garment_units_tagNumber_key" ON "garment_units"("tagNumber");
CREATE INDEX "garment_units_status_updatedAt_idx" ON "garment_units"("status", "updatedAt");
CREATE INDEX "garment_units_currentPlantPartnerId_status_idx" ON "garment_units"("currentPlantPartnerId", "status");
CREATE UNIQUE INDEX "garment_units_orderItemId_sequence_key" ON "garment_units"("orderItemId", "sequence");
CREATE INDEX "challan_garment_units_garmentUnitId_status_idx" ON "challan_garment_units"("garmentUnitId", "status");
CREATE UNIQUE INDEX "challan_garment_units_challanItemId_garmentUnitId_key" ON "challan_garment_units"("challanItemId", "garmentUnitId");
CREATE UNIQUE INDEX "challan_garment_units_active_unit_key" ON "challan_garment_units"("garmentUnitId") WHERE "status" = 'DISPATCHED';
CREATE UNIQUE INDEX "plant_quality_issues_issueNo_key" ON "plant_quality_issues"("issueNo");
CREATE UNIQUE INDEX "plant_quality_issues_open_unit_key" ON "plant_quality_issues"("garmentUnitId") WHERE "status" = 'OPEN' AND "garmentUnitId" IS NOT NULL;
CREATE INDEX "plant_quality_issues_status_severity_createdAt_idx" ON "plant_quality_issues"("status", "severity", "createdAt");
CREATE INDEX "plant_quality_issues_orderId_status_idx" ON "plant_quality_issues"("orderId", "status");
CREATE INDEX "plant_quality_issues_plantPartnerId_status_idx" ON "plant_quality_issues"("plantPartnerId", "status");

ALTER TABLE "return_garment_units" ADD CONSTRAINT "return_garment_units_returnLineId_fkey" FOREIGN KEY ("returnLineId") REFERENCES "return_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_garment_units" ADD CONSTRAINT "return_garment_units_garmentUnitId_fkey" FOREIGN KEY ("garmentUnitId") REFERENCES "garment_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "garment_units" ADD CONSTRAINT "garment_units_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "garment_units" ADD CONSTRAINT "garment_units_currentPlantPartnerId_fkey" FOREIGN KEY ("currentPlantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challan_garment_units" ADD CONSTRAINT "challan_garment_units_challanItemId_fkey" FOREIGN KEY ("challanItemId") REFERENCES "challan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challan_garment_units" ADD CONSTRAINT "challan_garment_units_garmentUnitId_fkey" FOREIGN KEY ("garmentUnitId") REFERENCES "garment_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challan_garment_units" ADD CONSTRAINT "challan_garment_units_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "challan_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_garmentUnitId_fkey" FOREIGN KEY ("garmentUnitId") REFERENCES "garment_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_plantPartnerId_fkey" FOREIGN KEY ("plantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_quality_issues_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "garment_units" ADD CONSTRAINT "garment_unit_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "garment_units" ADD CONSTRAINT "garment_unit_version_check" CHECK ("version" > 0);
ALTER TABLE "garment_units" ADD CONSTRAINT "garment_unit_status_check" CHECK ("status" IN ('RECEIVED', 'PROCESSING', 'AT_PLANT', 'RECEIVED_FROM_PLANT', 'RETURN_RECEIVED', 'ISSUE_HOLD', 'READY', 'DELIVERED', 'VOID'));
ALTER TABLE "challan_garment_units" ADD CONSTRAINT "challan_garment_unit_status_check" CHECK ("status" IN ('DISPATCHED', 'RECEIVED', 'MISSING', 'DAMAGED'));
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_issue_type_check" CHECK ("issueType" IN ('MISSING_ITEM', 'DAMAGE', 'STAIN_NOT_REMOVED', 'WRONG_ITEM', 'OTHER'));
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_issue_severity_check" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE "plant_quality_issues" ADD CONSTRAINT "plant_issue_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED', 'VOID'));
