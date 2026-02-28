export type CreateWorkspaceDto = {
  name: string;
  timezone?: string;
  scheduleStartHour?: number;
  scheduleEndHour?: number;
};
