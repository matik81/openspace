CREATE TABLE "UserWorkspacePreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserWorkspacePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserWorkspacePreference_userId_workspaceId_key"
  ON "UserWorkspacePreference"("userId", "workspaceId");

CREATE INDEX "UserWorkspacePreference_userId_sortOrder_idx"
  ON "UserWorkspacePreference"("userId", "sortOrder");

CREATE INDEX "UserWorkspacePreference_workspaceId_idx"
  ON "UserWorkspacePreference"("workspaceId");

ALTER TABLE "UserWorkspacePreference"
  ADD CONSTRAINT "UserWorkspacePreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserWorkspacePreference"
  ADD CONSTRAINT "UserWorkspacePreference_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
