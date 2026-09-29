-- CreateTable
CREATE TABLE "service_pages" (
    "id" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "suburbSlug" TEXT NOT NULL,
    "suburbName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "heroImage" TEXT NOT NULL,
    "heroImageAlt" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "faqs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "service_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_pages_status_idx" ON "service_pages"("status");

-- CreateIndex
CREATE UNIQUE INDEX "service_pages_serviceSlug_suburbSlug_key" ON "service_pages"("serviceSlug", "suburbSlug");
