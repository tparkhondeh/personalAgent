ALTER TABLE "Task" ADD COLUMN "alertPolicy" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "alertPolicy" TEXT;
ALTER TABLE "Meeting" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SCHEDULED';
CREATE TABLE "AgentDraft" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "conversationId" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "payload" TEXT NOT NULL, "preview" TEXT NOT NULL, "result" TEXT,
 "expiresAt" DATETIME NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AgentDraft_userId_conversationId_status_idx" ON "AgentDraft"("userId","conversationId","status");
CREATE TABLE "AiUsage" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "requests" INTEGER NOT NULL DEFAULT 0, "day" TEXT NOT NULL, "kind" TEXT NOT NULL,
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AiUsage_userId_day_idx" ON "AiUsage"("userId","day");
