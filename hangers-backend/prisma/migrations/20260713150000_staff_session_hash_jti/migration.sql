ALTER TABLE "staff_sessions" ALTER COLUMN "token" DROP NOT NULL;

ALTER TABLE "staff_sessions" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "staff_sessions" ADD COLUMN "sessionId" TEXT;

CREATE UNIQUE INDEX "staff_sessions_tokenHash_key" ON "staff_sessions"("tokenHash");
CREATE UNIQUE INDEX "staff_sessions_sessionId_key" ON "staff_sessions"("sessionId");

