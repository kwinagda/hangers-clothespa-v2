CREATE TABLE "staff_ui_preferences" (
    "staffId" TEXT NOT NULL,
    "primaryNavItems" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_ui_preferences_pkey" PRIMARY KEY ("staffId")
);

ALTER TABLE "staff_ui_preferences"
ADD CONSTRAINT "staff_ui_preferences_staffId_fkey"
FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
