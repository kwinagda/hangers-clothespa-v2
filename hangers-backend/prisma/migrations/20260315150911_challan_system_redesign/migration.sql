/*
  Warnings:

  - You are about to drop the column `bagCount` on the `delivery_challans` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `delivery_challans` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `delivery_challans` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "delivery_challans" DROP CONSTRAINT "delivery_challans_orderId_fkey";

-- AlterTable
ALTER TABLE "delivery_challans" DROP COLUMN "bagCount",
DROP COLUMN "items",
DROP COLUMN "orderId",
ADD COLUMN     "customerValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "vendorBillId" TEXT,
ADD COLUMN     "vendorCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'DISPATCHED';

-- CreateTable
CREATE TABLE "challan_orders" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challan_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challan_items" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "customerPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vendorCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isReceived" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_price_list" (
    "id" TEXT NOT NULL,
    "plant" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_price_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "plant" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challan_orders_challanId_orderId_key" ON "challan_orders"("challanId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_price_list_plant_serviceId_key" ON "vendor_price_list"("plant", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_billNo_key" ON "vendor_bills"("billNo");

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_orders" ADD CONSTRAINT "challan_orders_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_orders" ADD CONSTRAINT "challan_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_items" ADD CONSTRAINT "challan_items_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challan_items" ADD CONSTRAINT "challan_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
