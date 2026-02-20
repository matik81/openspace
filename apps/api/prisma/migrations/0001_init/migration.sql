CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "BookingStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "BookingCriticality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Workspace" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Workspace_createdByUserId_idx" ON "Workspace" ("createdByUserId");

CREATE TABLE "WorkspaceMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember" ("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_status_idx" ON "WorkspaceMember" ("userId", "status");

CREATE TABLE "Invitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "invitedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Invitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Invitation_workspaceId_email_status_idx" ON "Invitation" ("workspaceId", "email", "status");

CREATE TABLE "Room" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Room_workspaceId_name_key" ON "Room" ("workspaceId", "name");
CREATE INDEX "Room_workspaceId_idx" ON "Room" ("workspaceId");

CREATE TABLE "Booking" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(6) NOT NULL,
  "endAt" TIMESTAMPTZ(6) NOT NULL,
  "timeRange" tstzrange GENERATED ALWAYS AS (tstzrange("startAt", "endAt", '[)')) STORED,
  "subject" TEXT NOT NULL,
  "criticality" "BookingCriticality" NOT NULL DEFAULT 'MEDIUM',
  "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Booking_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_valid_range" CHECK ("endAt" > "startAt")
);

CREATE INDEX "Booking_roomId_startAt_idx" ON "Booking" ("roomId", "startAt");
CREATE INDEX "Booking_workspaceId_status_idx" ON "Booking" ("workspaceId", "status");

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

