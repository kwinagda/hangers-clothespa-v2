/*
  Warnings:

  - You are about to drop the column `email` on the `customers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "city" TEXT,
ADD COLUMN     "landmark" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "line1" TEXT,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "pincode" TEXT;

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "email",
ADD COLUMN     "mapLocation" TEXT;
