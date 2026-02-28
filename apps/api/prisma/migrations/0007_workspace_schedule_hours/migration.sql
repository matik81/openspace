ALTER TABLE "Workspace"
ADD COLUMN "scheduleStartHour" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "scheduleEndHour" INTEGER NOT NULL DEFAULT 18;

ALTER TABLE "Workspace"
ADD CONSTRAINT "Workspace_schedule_hours_check"
CHECK (
  "scheduleStartHour" >= 0
  AND "scheduleStartHour" <= 24
  AND "scheduleEndHour" >= 0
  AND "scheduleEndHour" <= 24
  AND "scheduleEndHour" > "scheduleStartHour"
);
