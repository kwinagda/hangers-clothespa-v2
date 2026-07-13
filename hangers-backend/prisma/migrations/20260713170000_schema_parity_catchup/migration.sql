-- CreateEnum
CREATE TYPE "AuthChallengePurpose" AS ENUM ('CUSTOMER_LOGIN', 'DELIVERY_CONFIRMATION');

-- CreateEnum
CREATE TYPE "AuthChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditEventStatus" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- DropForeignKey
ALTER TABLE "CustomerAddress" DROP CONSTRAINT "CustomerAddress_customerId_fkey";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "ironRateOverride" DOUBLE PRECISION,
ADD COLUMN     "ironSubStatus" TEXT,
ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'ENGLISH',
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "qualifiedAt" TIMESTAMP(3),
ADD COLUMN     "qualifyingOrderId" TEXT,
ADD COLUMN     "rewardPercent" DOUBLE PRECISION,
ADD COLUMN     "rewardedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'REWARDED';

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Preserve rows created by the obsolete CustomerAddress model before removing it.
-- The canonical addresses table requires line, city, and pincode values, so legacy
-- blanks receive explicit migration placeholders for later CRM review.
INSERT INTO "addresses" (
    "id",
    "customerId",
    "label",
    "addressLine1",
    "addressLine2",
    "landmark",
    "city",
    "pincode",
    "latitude",
    "longitude",
    "isDefault",
    "createdAt"
)
SELECT
    legacy."id",
    legacy."customerId",
    COALESCE(NULLIF(BTRIM(legacy."label"), ''), 'Home'),
    COALESCE(
        NULLIF(BTRIM(legacy."line1"), ''),
        NULLIF(BTRIM(legacy."address"), ''),
        'Legacy address requires review'
    ),
    NULL,
    NULLIF(BTRIM(legacy."landmark"), ''),
    COALESCE(NULLIF(BTRIM(legacy."city"), ''), 'Unknown'),
    CASE
        WHEN legacy."pincode" ~ '^[0-9]{6}$' THEN legacy."pincode"
        ELSE '000000'
    END,
    legacy."lat",
    legacy."lng",
    legacy."isDefault",
    legacy."createdAt"
FROM "CustomerAddress" AS legacy
WHERE EXISTS (
    SELECT 1
    FROM "customers" AS customer
    WHERE customer."id" = legacy."customerId"
)
ON CONFLICT ("id") DO NOTHING;

-- DropTable
DROP TABLE "CustomerAddress";

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "status" "AuditEventStatus" NOT NULL DEFAULT 'SUCCESS',
    "resource" TEXT,
    "resourceId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "route" TEXT,
    "method" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_throttles" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_catalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_role_permissions" (
    "id" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "permissionCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_service_allowances" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_service_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "status" "AuthChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "hashedCode" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldownUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iron_subscriptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "applicationStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iron_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iron_logs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "pieces" INTEGER NOT NULL,
    "ratePerPiece" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "whatsappSent" BOOLEAN NOT NULL DEFAULT false,
    "loggedById" TEXT NOT NULL,
    "billId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iron_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iron_bills" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "totalPieces" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "carryForwardNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iron_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_status_idx" ON "audit_logs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "auth_throttles_blockedUntil_idx" ON "auth_throttles"("blockedUntil");

-- CreateIndex
CREATE INDEX "auth_throttles_scope_blockedUntil_idx" ON "auth_throttles"("scope", "blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "auth_throttles_scope_scopeKey_key" ON "auth_throttles"("scope", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "permission_catalog_code_key" ON "permission_catalog"("code");

-- CreateIndex
CREATE INDEX "permission_catalog_category_idx" ON "permission_catalog"("category");

-- CreateIndex
CREATE INDEX "staff_role_permissions_permissionCode_idx" ON "staff_role_permissions"("permissionCode");

-- CreateIndex
CREATE UNIQUE INDEX "staff_role_permissions_role_permissionCode_key" ON "staff_role_permissions"("role", "permissionCode");

-- CreateIndex
CREATE INDEX "staff_service_allowances_serviceCode_idx" ON "staff_service_allowances"("serviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "staff_service_allowances_staffId_serviceCode_key" ON "staff_service_allowances"("staffId", "serviceCode");

-- CreateIndex
CREATE INDEX "auth_challenges_subjectType_subjectKey_purpose_idx" ON "auth_challenges"("subjectType", "subjectKey", "purpose");

-- CreateIndex
CREATE INDEX "auth_challenges_status_expiresAt_idx" ON "auth_challenges"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "iron_subscriptions_customerId_key" ON "iron_subscriptions"("customerId");

-- CreateIndex
CREATE INDEX "iron_subscriptions_applicationStatus_idx" ON "iron_subscriptions"("applicationStatus");

-- CreateIndex
CREATE INDEX "iron_logs_customerId_idx" ON "iron_logs"("customerId");

-- CreateIndex
CREATE INDEX "iron_logs_date_idx" ON "iron_logs"("date");

-- CreateIndex
CREATE INDEX "iron_logs_billId_idx" ON "iron_logs"("billId");

-- CreateIndex
CREATE INDEX "iron_logs_customerId_date_idx" ON "iron_logs"("customerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "iron_bills_billNumber_key" ON "iron_bills"("billNumber");

-- CreateIndex
CREATE INDEX "iron_bills_customerId_idx" ON "iron_bills"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "iron_bills_customerId_billingPeriodStart_key" ON "iron_bills"("customerId", "billingPeriodStart");

-- CreateIndex
CREATE INDEX "Order_assignedToId_status_idx" ON "Order"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Order_status_pickupDate_idx" ON "Order"("status", "pickupDate");

-- CreateIndex
CREATE INDEX "Order_customerId_status_createdAt_idx" ON "Order"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStage_orderId_createdAt_idx" ON "OrderStage"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_method_createdAt_idx" ON "Payment"("method", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_collectedBy_createdAt_idx" ON "Payment"("collectedBy", "createdAt");

-- CreateIndex
CREATE INDEX "attendance_staffId_date_idx" ON "attendance"("staffId", "date");

-- CreateIndex
CREATE INDEX "cash_book_date_idx" ON "cash_book"("date");

-- CreateIndex
CREATE INDEX "cash_book_type_idx" ON "cash_book"("type");

-- CreateIndex
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "recurring_pickups_customerId_isActive_idx" ON "recurring_pickups"("customerId", "isActive");

-- CreateIndex
CREATE INDEX "recurring_pickups_nextPickup_isActive_idx" ON "recurring_pickups"("nextPickup", "isActive");

-- CreateIndex
CREATE INDEX "wallet_transactions_customerId_createdAt_idx" ON "wallet_transactions"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "staff_role_permissions" ADD CONSTRAINT "staff_role_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permission_catalog"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_service_allowances" ADD CONSTRAINT "staff_service_allowances_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_subscriptions" ADD CONSTRAINT "iron_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_subscriptions" ADD CONSTRAINT "iron_subscriptions_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "iron_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_logs" ADD CONSTRAINT "iron_logs_billId_fkey" FOREIGN KEY ("billId") REFERENCES "iron_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_bills" ADD CONSTRAINT "iron_bills_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iron_bills" ADD CONSTRAINT "iron_bills_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "iron_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
