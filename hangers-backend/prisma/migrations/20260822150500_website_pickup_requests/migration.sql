CREATE TABLE "website_pickup_requests" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "serviceNeeded" TEXT,
  "preferredSlot" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "website_pickup_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "website_pickup_requests_status_createdAt_idx" ON "website_pickup_requests"("status", "createdAt");
