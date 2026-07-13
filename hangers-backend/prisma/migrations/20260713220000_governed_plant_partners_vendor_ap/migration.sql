CREATE TABLE "plant_partners" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "gstin" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_partners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plant_partners_code_key" ON "plant_partners"("code");
CREATE INDEX "plant_partners_isActive_name_idx" ON "plant_partners"("isActive", "name");

WITH legacy_codes AS (
  SELECT UPPER(REGEXP_REPLACE(TRIM("plant"), '[^A-Za-z0-9_-]+', '_', 'g')) AS code FROM "delivery_challans"
  UNION SELECT UPPER(REGEXP_REPLACE(TRIM("plant"), '[^A-Za-z0-9_-]+', '_', 'g')) FROM "vendor_price_list"
  UNION SELECT UPPER(REGEXP_REPLACE(TRIM("plant"), '[^A-Za-z0-9_-]+', '_', 'g')) FROM "vendor_bills"
  UNION SELECT UPPER(REGEXP_REPLACE(TRIM("fromPlant"), '[^A-Za-z0-9_-]+', '_', 'g')) FROM "transfer_orders"
  UNION SELECT UPPER(REGEXP_REPLACE(TRIM("toPlant"), '[^A-Za-z0-9_-]+', '_', 'g')) FROM "transfer_orders"
  UNION SELECT UNNEST(ARRAY['MAMTA', 'WADREX', 'YADGIR'])
)
INSERT INTO "plant_partners" ("id", "code", "name", "updatedAt")
SELECT 'plant_' || SUBSTR(MD5(code), 1, 20), code, INITCAP(REPLACE(code, '_', ' ')), CURRENT_TIMESTAMP
FROM legacy_codes WHERE code IS NOT NULL AND code <> ''
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "delivery_challans" ADD COLUMN "plantPartnerId" TEXT;
ALTER TABLE "transfer_orders" ADD COLUMN "fromPlantPartnerId" TEXT, ADD COLUMN "toPlantPartnerId" TEXT;
ALTER TABLE "vendor_price_list" ADD COLUMN "plantPartnerId" TEXT;
ALTER TABLE "vendor_bills"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "invoiceDate" TIMESTAMP(3),
  ADD COLUMN "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "plantPartnerId" TEXT,
  ADD COLUMN "vendorInvoiceNo" TEXT;

UPDATE "delivery_challans" d SET
  "plantPartnerId" = p."id", "plant" = p."code"
FROM "plant_partners" p
WHERE p."code" = UPPER(REGEXP_REPLACE(TRIM(d."plant"), '[^A-Za-z0-9_-]+', '_', 'g'));

UPDATE "vendor_price_list" v SET
  "plantPartnerId" = p."id", "plant" = p."code"
FROM "plant_partners" p
WHERE p."code" = UPPER(REGEXP_REPLACE(TRIM(v."plant"), '[^A-Za-z0-9_-]+', '_', 'g'));

UPDATE "vendor_bills" v SET
  "plantPartnerId" = p."id",
  "plant" = p."code",
  "invoiceDate" = v."createdAt",
  "dueDate" = v."createdAt" + (p."paymentTermsDays" * INTERVAL '1 day'),
  "paidAmount" = CASE WHEN v."status" = 'PAID' THEN v."totalAmount" ELSE 0 END,
  "approvedAt" = CASE WHEN v."status" = 'PAID' THEN v."createdAt" ELSE NULL END
FROM "plant_partners" p
WHERE p."code" = UPPER(REGEXP_REPLACE(TRIM(v."plant"), '[^A-Za-z0-9_-]+', '_', 'g'));

UPDATE "transfer_orders" t SET
  "fromPlantPartnerId" = fp."id", "fromPlant" = fp."code",
  "toPlantPartnerId" = tp."id", "toPlant" = tp."code"
FROM "plant_partners" fp, "plant_partners" tp
WHERE fp."code" = UPPER(REGEXP_REPLACE(TRIM(t."fromPlant"), '[^A-Za-z0-9_-]+', '_', 'g'))
  AND tp."code" = UPPER(REGEXP_REPLACE(TRIM(t."toPlant"), '[^A-Za-z0-9_-]+', '_', 'g'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "delivery_challans" WHERE "plantPartnerId" IS NULL)
    OR EXISTS (SELECT 1 FROM "vendor_price_list" WHERE "plantPartnerId" IS NULL)
    OR EXISTS (SELECT 1 FROM "vendor_bills" WHERE "plantPartnerId" IS NULL)
    OR EXISTS (SELECT 1 FROM "transfer_orders" WHERE "fromPlantPartnerId" IS NULL OR "toPlantPartnerId" IS NULL)
  THEN RAISE EXCEPTION 'Unable to map one or more legacy plant references';
  END IF;
END $$;

ALTER TABLE "delivery_challans" ALTER COLUMN "plantPartnerId" SET NOT NULL;
ALTER TABLE "vendor_price_list" ALTER COLUMN "plantPartnerId" SET NOT NULL;
ALTER TABLE "vendor_bills" ALTER COLUMN "plantPartnerId" SET NOT NULL;
ALTER TABLE "transfer_orders" ALTER COLUMN "fromPlantPartnerId" SET NOT NULL, ALTER COLUMN "toPlantPartnerId" SET NOT NULL;

CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "plantPartnerId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CAPTURED',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vendor_payment_allocations" (
    "id" TEXT NOT NULL,
    "vendorPaymentId" TEXT NOT NULL,
    "vendorBillId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_payment_allocations_pkey" PRIMARY KEY ("id")
);

WITH legacy_payer AS (SELECT "id" FROM "staff" ORDER BY "createdAt" ASC LIMIT 1)
INSERT INTO "vendor_payments" ("id", "paymentNo", "plantPartnerId", "amount", "method", "paidAt", "notes", "recordedById", "createdAt")
SELECT 'vp_legacy_' || SUBSTR(MD5(v."id"), 1, 20), 'VP-LEGACY-' || v."billNo", v."plantPartnerId", v."totalAmount",
       'LEGACY_UNKNOWN', COALESCE(v."paidAt", v."createdAt"), 'Backfilled from legacy paid vendor bill status', p."id", v."createdAt"
FROM "vendor_bills" v CROSS JOIN legacy_payer p WHERE v."status" = 'PAID' AND v."totalAmount" > 0;

INSERT INTO "vendor_payment_allocations" ("id", "vendorPaymentId", "vendorBillId", "amount", "createdAt")
SELECT 'vpa_legacy_' || SUBSTR(MD5(v."id"), 1, 20), 'vp_legacy_' || SUBSTR(MD5(v."id"), 1, 20), v."id", v."totalAmount", v."createdAt"
FROM "vendor_bills" v WHERE v."status" = 'PAID' AND v."totalAmount" > 0;

INSERT INTO "document_sequences" ("id", "sequenceKey", "scope", "documentType", "period", "nextValue", "createdAt", "updatedAt")
VALUES ('seq_vendor_payment', 'DEFAULT:VENDOR_PAYMENT:ALL', 'DEFAULT', 'VENDOR_PAYMENT', 'ALL', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("sequenceKey") DO NOTHING;

CREATE UNIQUE INDEX "vendor_payments_paymentNo_key" ON "vendor_payments"("paymentNo");
CREATE INDEX "vendor_payments_plantPartnerId_paidAt_idx" ON "vendor_payments"("plantPartnerId", "paidAt");
CREATE INDEX "vendor_payment_allocations_vendorBillId_createdAt_idx" ON "vendor_payment_allocations"("vendorBillId", "createdAt");
CREATE UNIQUE INDEX "vendor_payment_allocations_vendorPaymentId_vendorBillId_key" ON "vendor_payment_allocations"("vendorPaymentId", "vendorBillId");
CREATE INDEX "vendor_bills_plantPartnerId_status_dueDate_idx" ON "vendor_bills"("plantPartnerId", "status", "dueDate");
CREATE UNIQUE INDEX "vendor_bills_plantPartnerId_vendorInvoiceNo_key" ON "vendor_bills"("plantPartnerId", "vendorInvoiceNo");
CREATE UNIQUE INDEX "vendor_price_list_plantPartnerId_serviceId_key" ON "vendor_price_list"("plantPartnerId", "serviceId");

ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_fromPlantPartnerId_fkey" FOREIGN KEY ("fromPlantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_toPlantPartnerId_fkey" FOREIGN KEY ("toPlantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_plantPartnerId_fkey" FOREIGN KEY ("plantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_price_list" ADD CONSTRAINT "vendor_price_list_plantPartnerId_fkey" FOREIGN KEY ("plantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_plantPartnerId_fkey" FOREIGN KEY ("plantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_plantPartnerId_fkey" FOREIGN KEY ("plantPartnerId") REFERENCES "plant_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendorPaymentId_fkey" FOREIGN KEY ("vendorPaymentId") REFERENCES "vendor_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocations_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plant_partners" ADD CONSTRAINT "plant_partner_terms_check" CHECK ("paymentTermsDays" BETWEEN 0 AND 365);
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bill_amounts_check" CHECK ("totalAmount" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "totalAmount");
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bill_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'PARTIAL', 'PAID', 'VOID'));
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payment_amount_check" CHECK ("amount" > 0);
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payment_status_check" CHECK ("status" IN ('CAPTURED', 'VOID'));
ALTER TABLE "vendor_payment_allocations" ADD CONSTRAINT "vendor_payment_allocation_amount_check" CHECK ("amount" > 0);
