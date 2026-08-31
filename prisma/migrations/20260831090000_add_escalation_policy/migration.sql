-- Extend user-controlled escalation policy with safe defaults.
ALTER TABLE "UserPreference" ADD COLUMN "urgentEscalationEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "urgentRepeatMinutes" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "UserPreference" ADD COLUMN "urgentMaxRepeats" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "UserPreference" ADD COLUMN "androidAlarmEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "highPriorityEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserPreference" ADD COLUMN "smsEscalationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPreference" ADD COLUMN "callEscalationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Every escalation is idempotent and traceable. Paid providers remain mocked.
CREATE TABLE "EscalationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'LOCAL',
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "lastError" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EscalationAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EscalationAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EscalationAttempt_idempotencyKey_key" ON "EscalationAttempt"("idempotencyKey");
CREATE INDEX "EscalationAttempt_userId_status_scheduledFor_idx" ON "EscalationAttempt"("userId", "status", "scheduledFor");
CREATE INDEX "EscalationAttempt_taskId_createdAt_idx" ON "EscalationAttempt"("taskId", "createdAt");
