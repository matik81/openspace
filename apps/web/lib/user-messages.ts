export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

export const ERROR_MESSAGE_BY_CODE: Record<string, string> = {
  ADMIN_CANNOT_BE_REMOVED: 'Workspace admins cannot be removed',
  ACCOUNT_DELETE_CONFIRMATION_FAILED: 'The email or password does not match your account',
  ACCOUNT_UPDATE_CONFIRMATION_FAILED: 'The current password does not match your account',
  CURRENT_PASSWORD_REQUIRED: 'Enter your current password to change your password',
  ONLY_WORKSPACE_OWNER: 'Only the workspace owner can perform this action',
  OWNER_CANNOT_LEAVE_WORKSPACE: 'Workspace owners cannot leave the workspace',
  OWNER_ROLE_CANNOT_CHANGE: 'The workspace owner role cannot be changed',
  PASSWORD_MISMATCH: 'The passwords do not match',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again',
  WORKSPACE_LEAVE_CONFIRMATION_FAILED: 'The email or password does not match your account',
  WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_FAILED:
    'The email or password does not match your account',
};

export const ERROR_MESSAGE_BY_TEXT: Record<string, string> = {
  'Booking overlaps with an existing active booking': 'This booking overlaps an existing active booking',
  'Current password is required when changing password':
    'Enter your current password to change your password',
  'Date and time values must be valid in the workspace timezone':
    'The selected date and time are invalid in the workspace time zone',
  'End time must be after start time': 'The end time must be later than the start time',
  'Invitation details are unavailable': 'The invitation details could not be loaded',
  'Invitation token is invalid': 'This invitation link is invalid',
  'Invitation token is required': 'The invitation link is incomplete',
  'New password and confirmation must match': 'The passwords do not match',
  'Password and password confirmation must match': 'The passwords do not match',
  'Reservations can only be created or moved on the current workspace day or later':
    'Bookings can only be created or moved on the current workspace day or later',
  'Room is required': 'Select a room',
  'Start and end time are required': 'Select both a start and end time',
  'Title is required': 'Enter a booking title',
  'Unable to compute booking time in workspace timezone':
    'The selected time could not be processed in the workspace time zone',
  'Unexpected account payload': 'The updated account details could not be loaded',
  'Unexpected bookings payload': 'The booking schedule could not be loaded',
  'Unexpected rooms payload': 'The room list could not be loaded',
  'Unexpected workspace payload': 'The workspace list could not be loaded',
  'User already has an active booking in this time range':
    'You already have an active booking during this time',
  'Workspace not visible': 'This workspace is not available to your account',
};
