CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "BookingCancellationReason" AS ENUM (
  'USER_CANCELLED',
  'USER_LEFT_WORKSPACE',
  'ROOM_UNAVAILABLE',
  'SCHEDULE_INCOMPATIBLE'
);
CREATE TYPE "RateLimitOperationType" AS ENUM (
  'REGISTER',
  'CREATE_WORKSPACE',
  'CREATE_ROOM',
  'CREATE_INVITATION',
  'CREATE_BOOKING'
);
CREATE TYPE "RateLimitSubjectType" AS ENUM ('IP', 'USER');

ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);

ALTER TABLE "Workspace"
  ADD COLUMN "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);

ALTER TABLE "Room"
  ADD COLUMN "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6);

ALTER TABLE "Booking"
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6),
  ADD COLUMN "cancellationReason" "BookingCancellationReason";

CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace" ("name");

CREATE TABLE "WorkspaceScheduleVersion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "timezone" TEXT NOT NULL,
  "scheduleStartHour" INTEGER NOT NULL,
  "scheduleEndHour" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceScheduleVersion_workspaceId_fkey"
    FOREIGN KEY ("workspaceId")
    REFERENCES "Workspace"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceScheduleVersion_schedule_hours_check"
    CHECK (
      "scheduleStartHour" >= 0
      AND "scheduleStartHour" <= 24
      AND "scheduleEndHour" >= 0
      AND "scheduleEndHour" <= 24
      AND "scheduleEndHour" > "scheduleStartHour"
    )
);

CREATE UNIQUE INDEX "WorkspaceScheduleVersion_workspaceId_effectiveFrom_key"
  ON "WorkspaceScheduleVersion" ("workspaceId", "effectiveFrom");
CREATE INDEX "WorkspaceScheduleVersion_workspaceId_effectiveFrom_idx"
  ON "WorkspaceScheduleVersion" ("workspaceId", "effectiveFrom");

INSERT INTO "WorkspaceScheduleVersion" (
  "workspaceId",
  "timezone",
  "scheduleStartHour",
  "scheduleEndHour",
  "effectiveFrom"
)
SELECT
  "id",
  "timezone",
  "scheduleStartHour",
  "scheduleEndHour",
  "createdAt"
FROM "Workspace";

CREATE TABLE "OperationLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "operationType" "RateLimitOperationType" NOT NULL,
  "ipAddress" TEXT,
  "userId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationLog_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "OperationLog_operationType_ipAddress_createdAt_idx"
  ON "OperationLog" ("operationType", "ipAddress", "createdAt");
CREATE INDEX "OperationLog_operationType_userId_createdAt_idx"
  ON "OperationLog" ("operationType", "userId", "createdAt");

CREATE TABLE "RateLimitSuspension" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "subjectType" "RateLimitSubjectType" NOT NULL,
  "operationType" "RateLimitOperationType" NOT NULL,
  "ipAddress" TEXT,
  "userId" UUID,
  "suspendedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RateLimitSuspension_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "RateLimitSuspension_subjectType_ipAddress_expiresAt_idx"
  ON "RateLimitSuspension" ("subjectType", "ipAddress", "expiresAt");
CREATE INDEX "RateLimitSuspension_subjectType_userId_expiresAt_idx"
  ON "RateLimitSuspension" ("subjectType", "userId", "expiresAt");
