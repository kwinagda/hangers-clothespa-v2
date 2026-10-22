-- Additive infrastructure only. Application/release authorization is separate.
-- No card credentials, provider tokens or raw provider responses are persisted.
CREATE TABLE "razorpay_saved_card_customers" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "razorpayCustomerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_saved_card_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_card_customers_mode_check" CHECK ("mode" IN ('TEST', 'LIVE')),
  CONSTRAINT "saved_card_customers_status_check" CHECK ("status" IN ('CREATING', 'READY', 'REVIEW')),
  CONSTRAINT "saved_card_customers_fingerprint_check" CHECK ("credentialFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "saved_card_customers_provider_id_check" CHECK (
    "razorpayCustomerId" IS NULL OR "razorpayCustomerId" ~ '^cust_[A-Za-z0-9]{1,64}$'
  ),
  CONSTRAINT "saved_card_customers_ready_check" CHECK (
    "status" <> 'READY' OR ("razorpayCustomerId" IS NOT NULL AND "verifiedAt" IS NOT NULL)
  ),
  CONSTRAINT "saved_card_customers_customer_fkey" FOREIGN KEY ("customerId")
    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "saved_card_customers_payer_mode_key"
  ON "razorpay_saved_card_customers"("customerId", "mode");
CREATE UNIQUE INDEX "saved_card_customers_provider_mode_key"
  ON "razorpay_saved_card_customers"("mode", "razorpayCustomerId");
CREATE INDEX "saved_card_customers_status_created_idx"
  ON "razorpay_saved_card_customers"("status", "createdAt");

CREATE TABLE "razorpay_saved_card_consents" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "wordingVersion" TEXT NOT NULL,
  "wording" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "razorpay_saved_card_consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_card_consents_mode_check" CHECK ("mode" IN ('TEST', 'LIVE')),
  CONSTRAINT "saved_card_consents_fingerprint_check" CHECK ("credentialFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "saved_card_consents_consumed_check" CHECK ("consumedAt" IS NULL OR "consumedAt" >= "createdAt"),
  CONSTRAINT "saved_card_consents_customer_fkey" FOREIGN KEY ("customerId")
    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "saved_card_consents_payer_mode_request_key"
  ON "razorpay_saved_card_consents"("customerId", "mode", "requestId");
CREATE INDEX "saved_card_consents_payer_mode_created_idx"
  ON "razorpay_saved_card_consents"("customerId", "mode", "createdAt");
