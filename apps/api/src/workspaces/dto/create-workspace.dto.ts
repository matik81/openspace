export type CreateWorkspaceDto = {
  name: string;
  slug?: string;
  timezone?: string;
  scheduleStartHour?: number;
  scheduleEndHour?: number;
};
