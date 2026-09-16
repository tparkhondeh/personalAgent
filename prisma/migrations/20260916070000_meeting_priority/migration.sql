-- Preserve the priority previously displayed for existing/legacy meetings.
-- Newly reviewed requests explicitly supply their selected priority.
ALTER TABLE "Meeting" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'IMPORTANT';
