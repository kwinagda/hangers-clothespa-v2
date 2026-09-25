CREATE TABLE "razorpay_webhook_events" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "razorpay_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "razorpay_webhook_events_eventId_key" ON "razorpay_webhook_events"("eventId");
CREATE INDEX "razorpay_webhook_events_status_createdAt_idx" ON "razorpay_webhook_events"("status", "createdAt");
