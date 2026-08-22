ALTER TABLE "website_pickup_requests"
ADD COLUMN "externalSource" TEXT,
ADD COLUMN "externalRequestId" TEXT,
ADD COLUMN "queuedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "website_pickup_requests_externalSource_externalRequestId_key"
ON "website_pickup_requests"("externalSource", "externalRequestId");
