CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "BookingCancellationReason" AS ENUM (
  'USER_CANCELLED',
  'USER_LEFT_WORKSPACE',
  'ROOM_UNAVAILABLE',
  'SCHEDULE_INCOMPATIBLE'
);
CREATE TYPE "BookingCriticality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "RateLimitOperationType" AS ENUM (
  'REGISTER',
  'CREATE_WORKSPACE',
  'CREATE_ROOM',
  'CREATE_INVITATION',
  'CREATE_BOOKING'
);
CREATE TYPE "RateLimitSubjectType" AS ENUM ('IP', 'USER');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "emailVerifiedAt" TIMESTAMP(3),
  "refreshTokenHash" TEXT,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workspace" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "scheduleStartHour" INTEGER NOT NULL DEFAULT 8,
  "scheduleEndHour" INTEGER NOT NULL DEFAULT 18,
  "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_schedule_hours_check"
    CHECK (
      "scheduleStartHour" >= 0
      AND "scheduleStartHour" <= 24
      AND "scheduleEndHour" >= 0
      AND "scheduleEndHour" <= 24
      AND "scheduleEndHour" > "scheduleStartHour"
    )
);

CREATE TABLE "UserWorkspacePreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserWorkspacePreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invitedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(6) NOT NULL,
  "endAt" TIMESTAMPTZ(6) NOT NULL,
  "timeRange" tstzrange GENERATED ALWAYS AS (tstzrange("startAt", "endAt", '[)')) STORED,
  "subject" TEXT NOT NULL,
  "criticality" "BookingCriticality" NOT NULL DEFAULT 'MEDIUM',
  "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" "BookingCancellationReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_valid_range" CHECK ("endAt" > "startAt")
);

CREATE TABLE "WorkspaceScheduleVersion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "timezone" TEXT NOT NULL,
  "scheduleStartHour" INTEGER NOT NULL,
  "scheduleEndHour" INTEGER NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceScheduleVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceScheduleVersion_schedule_hours_check"
    CHECK (
      "scheduleStartHour" >= 0
      AND "scheduleStartHour" <= 24
      AND "scheduleEndHour" >= 0
      AND "scheduleEndHour" <= 24
      AND "scheduleEndHour" > "scheduleStartHour"
    )
);

CREATE TABLE "OperationLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operationType" "RateLimitOperationType" NOT NULL,
  "ipAddress" TEXT,
  "userId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitSuspension" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subjectType" "RateLimitSubjectType" NOT NULL,
  "operationType" "RateLimitOperationType" NOT NULL,
  "ipAddress" TEXT,
  "userId" UUID,
  "suspendedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RateLimitSuspension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailVerificationToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Workspace_createdByUserId_idx" ON "Workspace"("createdByUserId");
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");
CREATE INDEX "UserWorkspacePreference_userId_sortOrder_idx" ON "UserWorkspacePreference"("userId", "sortOrder");
CREATE INDEX "UserWorkspacePreference_workspaceId_idx" ON "UserWorkspacePreference"("workspaceId");
CREATE UNIQUE INDEX "UserWorkspacePreference_userId_workspaceId_key" ON "UserWorkspacePreference"("userId", "workspaceId");
CREATE INDEX "WorkspaceMember_userId_status_idx" ON "WorkspaceMember"("userId", "status");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "Invitation_workspaceId_email_status_idx" ON "Invitation"("workspaceId", "email", "status");
CREATE INDEX "Room_workspaceId_idx" ON "Room"("workspaceId");
CREATE UNIQUE INDEX "Room_workspaceId_name_key" ON "Room"("workspaceId", "name");
CREATE INDEX "Booking_roomId_startAt_idx" ON "Booking"("roomId", "startAt");
CREATE INDEX "Booking_workspaceId_status_idx" ON "Booking"("workspaceId", "status");
CREATE UNIQUE INDEX "WorkspaceScheduleVersion_workspaceId_effectiveFrom_key"
  ON "WorkspaceScheduleVersion"("workspaceId", "effectiveFrom");
CREATE INDEX "WorkspaceScheduleVersion_workspaceId_effectiveFrom_idx"
  ON "WorkspaceScheduleVersion"("workspaceId", "effectiveFrom");
CREATE INDEX "OperationLog_operationType_ipAddress_createdAt_idx"
  ON "OperationLog"("operationType", "ipAddress", "createdAt");
CREATE INDEX "OperationLog_operationType_userId_createdAt_idx"
  ON "OperationLog"("operationType", "userId", "createdAt");
CREATE INDEX "RateLimitSuspension_subjectType_ipAddress_expiresAt_idx"
  ON "RateLimitSuspension"("subjectType", "ipAddress", "expiresAt");
CREATE INDEX "RateLimitSuspension_subjectType_userId_expiresAt_idx"
  ON "RateLimitSuspension"("subjectType", "userId", "expiresAt");
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");
CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_idx" ON "EmailVerificationToken"("expiresAt", "consumedAt");

ALTER TABLE "Workspace"
  ADD CONSTRAINT "Workspace_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserWorkspacePreference"
  ADD CONSTRAINT "UserWorkspacePreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserWorkspacePreference"
  ADD CONSTRAINT "UserWorkspacePreference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Room"
  ADD CONSTRAINT "Room_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceScheduleVersion"
  ADD CONSTRAINT "WorkspaceScheduleVersion_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperationLog"
  ADD CONSTRAINT "OperationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RateLimitSuspension"
  ADD CONSTRAINT "RateLimitSuspension_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_active_overlap_exclusion"
  EXCLUDE USING gist (
    "roomId" WITH =,
    "timeRange" WITH &&
  )
  WHERE ("status" = 'ACTIVE');

CREATE INDEX "Booking_active_overlap_idx"
  ON "Booking"
  USING gist ("roomId", "timeRange")
  WHERE ("status" = 'ACTIVE');

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_active_user_overlap_exclusion"
  EXCLUDE USING gist (
    "workspaceId" WITH =,
    "createdByUserId" WITH =,
    "timeRange" WITH &&
  )
  WHERE ("status" = 'ACTIVE');

CREATE INDEX "Booking_active_user_overlap_idx"
  ON "Booking"
  USING gist ("workspaceId", "createdByUserId", "timeRange")
  WHERE ("status" = 'ACTIVE');
