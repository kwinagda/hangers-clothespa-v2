CREATE TABLE "delivery_assignments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DELIVERY',
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "assigneeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attemptedById" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reasonCode" TEXT,
    "notes" TEXT,
    "confirmationMethod" TEXT,
    "confirmationReference" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

INSERT INTO "delivery_assignments" ("id", "orderId", "kind", "status", "assigneeId", "assignedById", "scheduledAt", "completedAt", "createdAt", "updatedAt")
SELECT 'da_legacy_' || SUBSTR(MD5(o."id" || ':' || o."assignedToId"), 1, 18), o."id",
       CASE WHEN o."status" IN ('PENDING', 'PICKED_UP') THEN 'PICKUP' ELSE 'DELIVERY' END,
       CASE WHEN o."status" IN ('PICKED_UP', 'DELIVERED') THEN 'COMPLETED' WHEN o."status" = 'OUT_FOR_DELIVERY' THEN 'IN_PROGRESS' ELSE 'ASSIGNED' END,
       o."assignedToId", o."assignedToId",
       CASE WHEN o."status" = 'PENDING' THEN o."pickupDate" ELSE o."deliveryDate" END,
       CASE WHEN o."status" IN ('PICKED_UP', 'DELIVERED') THEN COALESCE(o."deliveredAt", o."updatedAt") ELSE NULL END,
       o."createdAt", o."updatedAt"
FROM "Order" o
JOIN "staff" s ON s."id" = o."assignedToId"
WHERE o."documentType" = 'ORDER'
  AND o."assignedToId" IS NOT NULL
  AND s."role"::TEXT IN ('DELIVERY_RIDER', 'DELIVERY_MANAGER')
  AND o."status" IN ('PENDING', 'PICKED_UP', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED');

INSERT INTO "delivery_attempts" ("id", "assignmentId", "orderId", "attemptedById", "outcome", "reasonCode", "notes", "confirmationMethod", "attemptedAt")
SELECT 'dat_legacy_' || SUBSTR(MD5(a."id"), 1, 17), a."id", a."orderId", a."assigneeId",
       CASE WHEN a."kind" = 'PICKUP' THEN 'PICKED_UP' ELSE 'DELIVERED' END,
       'LEGACY_BACKFILL', 'Backfilled from the legacy order status and assignee cache',
       CASE WHEN a."kind" = 'DELIVERY' THEN 'LEGACY_UNKNOWN' ELSE NULL END,
       COALESCE(a."completedAt", a."updatedAt")
FROM "delivery_assignments" a WHERE a."status" = 'COMPLETED';

CREATE INDEX "delivery_assignments_assigneeId_status_scheduledAt_idx" ON "delivery_assignments"("assigneeId", "status", "scheduledAt");
CREATE INDEX "delivery_assignments_orderId_kind_status_idx" ON "delivery_assignments"("orderId", "kind", "status");
CREATE UNIQUE INDEX "delivery_assignments_active_order_kind_key" ON "delivery_assignments"("orderId", "kind") WHERE "status" IN ('ASSIGNED', 'IN_PROGRESS');
CREATE INDEX "delivery_attempts_orderId_attemptedAt_idx" ON "delivery_attempts"("orderId", "attemptedAt");
CREATE INDEX "delivery_attempts_assignmentId_attemptedAt_idx" ON "delivery_attempts"("assignmentId", "attemptedAt");

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "delivery_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_attemptedById_fkey" FOREIGN KEY ("attemptedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignment_kind_check" CHECK ("kind" IN ('PICKUP', 'DELIVERY'));
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignment_status_check" CHECK ("status" IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignment_version_check" CHECK ("version" > 0);
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempt_outcome_check" CHECK ("outcome" IN ('PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED'));
