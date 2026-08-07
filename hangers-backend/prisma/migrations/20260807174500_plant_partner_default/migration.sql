ALTER TABLE "plant_partners" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "plant_partners" SET "isDefault" = true
WHERE "id" = (
  SELECT "id" FROM "plant_partners" WHERE "isActive" = true ORDER BY "createdAt" ASC LIMIT 1
);
