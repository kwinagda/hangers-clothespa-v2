ALTER TABLE "razorpay_checkout_attempts"
ADD COLUMN "experimentId" TEXT,
ADD COLUMN "experimentVariant" TEXT,
ADD COLUMN "experimentVisitorHash" TEXT;

CREATE TABLE "razorpay_checkout_experiment_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "attemptId" TEXT,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_checkout_experiment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "razorpay_checkout_experiment_events_eventId_key" UNIQUE ("eventId"),
    CONSTRAINT "razorpay_checkout_experiment_events_variant_check" CHECK ("variant" IN ('A', 'B')),
    CONSTRAINT "razorpay_checkout_experiment_events_type_check" CHECK ("eventType" IN ('EXPOSURE', 'CTA_CLICK', 'CHECKOUT_OPENED', 'CHECKOUT_ABANDONED', 'CHECKOUT_CALLBACK_RETURNED', 'CLIENT_ERROR', 'CRM_CAPTURED')),
    CONSTRAINT "razorpay_checkout_experiment_events_mode_check" CHECK ("mode" = 'TEST'),
    CONSTRAINT "razorpay_checkout_experiment_events_experiment_check" CHECK ("experimentId" = 'invoice_checkout_presentation_v1')
);

CREATE INDEX "razorpay_checkout_experiment_events_experimentId_mode_createdAt_idx"
ON "razorpay_checkout_experiment_events"("experimentId", "mode", "createdAt");

CREATE INDEX "razorpay_checkout_experiment_events_experimentId_variant_eventType_createdAt_idx"
ON "razorpay_checkout_experiment_events"("experimentId", "variant", "eventType", "createdAt");

CREATE INDEX "razorpay_checkout_experiment_events_attemptId_idx"
ON "razorpay_checkout_experiment_events"("attemptId");
