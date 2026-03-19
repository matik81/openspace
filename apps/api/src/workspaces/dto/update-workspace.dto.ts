export type UpdateWorkspaceDto = {
  name?: string;
  slug?: string;
  timezone?: string;
  scheduleStartHour?: number;
  scheduleEndHour?: number;
};
