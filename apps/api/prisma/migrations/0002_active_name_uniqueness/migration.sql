DROP INDEX IF EXISTS "Workspace_name_key";
CREATE UNIQUE INDEX "Workspace_active_name_key"
  ON "Workspace" ("name")
  WHERE ("status" = 'ACTIVE');

DROP INDEX IF EXISTS "Room_workspaceId_name_key";
CREATE UNIQUE INDEX "Room_active_workspaceId_name_key"
  ON "Room" ("workspaceId", "name")
  WHERE ("status" = 'ACTIVE');
