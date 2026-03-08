import { BACKEND_POLICY_DEFAULTS } from '../common/backend-policy.defaults';
import { isIP } from 'net';

type EnvInput = Record<string, unknown>;

type ValidatedEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  API_PORT: number;
  DATABASE_URL: string;
  TRUSTED_PROXY_IPS: string[];
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  EMAIL_VERIFICATION_TTL_MINUTES: number;
  PASSWORD_RESET_TTL_MINUTES: number;
  MAX_WORKSPACES_PER_USER: number;
  MAX_ROOMS_PER_WORKSPACE: number;
  MAX_USERS_PER_WORKSPACE: number;
  MAX_PENDING_INVITATIONS_PER_WORKSPACE: number;
  MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE: number;
  MAX_BOOKING_DAYS_AHEAD: number;
  MAX_REGISTRATIONS_PER_HOUR_PER_IP: number;
  MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER: number;
  MAX_ROOM_CREATIONS_PER_HOUR_PER_USER: number;
  MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER: number;
  MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER: number;
  RATE_LIMIT_SUSPENSION_HOURS: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parsePort(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535');
  }

  return parsed;
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  fieldName: string,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

function assertUrl(name: string, value: unknown, fallback?: string): string {
  const resolvedValue = isNonEmptyString(value) ? value : fallback;

  if (!isNonEmptyString(resolvedValue)) {
    throw new Error(`${name} is required`);
  }

  try {
    // URL parsing ensures basic URI structure.
    new URL(resolvedValue);
    return resolvedValue;
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

function assertSecret(name: string, value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} is required`);
  }

  if (value.length < 16) {
    throw new Error(`${name} must be at least 16 characters`);
  }

  return value;
}

function defaultTrustedProxyIps(
  nodeEnv: 'development' | 'test' | 'production',
): string[] {
  return nodeEnv === 'production' ? [] : ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
}

function parseTrustedProxyIps(
  value: unknown,
  fallback: string[],
): string[] {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    throw new Error('TRUSTED_PROXY_IPS must be a comma-separated string of IP addresses');
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  for (const item of items) {
    if (isIP(item) === 0) {
      throw new Error('TRUSTED_PROXY_IPS must contain only valid IP addresses');
    }
  }

  return items;
}

export function validateEnv(config: EnvInput): ValidatedEnv {
  const errors: string[] = [];

  let nodeEnv: ValidatedEnv['NODE_ENV'] = 'development';
  const rawNodeEnv = config.NODE_ENV;
  if (isNonEmptyString(rawNodeEnv)) {
    if (rawNodeEnv === 'development' || rawNodeEnv === 'test' || rawNodeEnv === 'production') {
      nodeEnv = rawNodeEnv;
    } else {
      errors.push('NODE_ENV must be one of: development, test, production');
    }
  }

  let apiPort = 3001;
  try {
    apiPort = parsePort(config.API_PORT, 3001);
  } catch (error) {
    errors.push((error as Error).message);
  }

  let databaseUrl = '';
  let trustedProxyIps = defaultTrustedProxyIps(nodeEnv);
  let jwtAccessSecret = '';
  let jwtRefreshSecret = '';

  try {
    databaseUrl = assertUrl('DATABASE_URL', config.DATABASE_URL);
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    trustedProxyIps = parseTrustedProxyIps(
      config.TRUSTED_PROXY_IPS,
      defaultTrustedProxyIps(nodeEnv),
    );
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    jwtAccessSecret = assertSecret('JWT_ACCESS_SECRET', config.JWT_ACCESS_SECRET);
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    jwtRefreshSecret = assertSecret('JWT_REFRESH_SECRET', config.JWT_REFRESH_SECRET);
  } catch (error) {
    errors.push((error as Error).message);
  }

  const jwtAccessTtl =
    isNonEmptyString(config.JWT_ACCESS_TTL) ? config.JWT_ACCESS_TTL : '15m';
  const jwtRefreshTtl =
    isNonEmptyString(config.JWT_REFRESH_TTL) ? config.JWT_REFRESH_TTL : '7d';
  let emailVerificationTtlMinutes = BACKEND_POLICY_DEFAULTS.EMAIL_VERIFICATION_TTL_MINUTES;
  let passwordResetTtlMinutes = BACKEND_POLICY_DEFAULTS.PASSWORD_RESET_TTL_MINUTES;
  let maxWorkspacesPerUser = BACKEND_POLICY_DEFAULTS.MAX_WORKSPACES_PER_USER;
  let maxRoomsPerWorkspace = BACKEND_POLICY_DEFAULTS.MAX_ROOMS_PER_WORKSPACE;
  let maxUsersPerWorkspace = BACKEND_POLICY_DEFAULTS.MAX_USERS_PER_WORKSPACE;
  let maxPendingInvitationsPerWorkspace =
    BACKEND_POLICY_DEFAULTS.MAX_PENDING_INVITATIONS_PER_WORKSPACE;
  let maxFutureBookingsPerUserPerWorkspace =
    BACKEND_POLICY_DEFAULTS.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE;
  let maxBookingDaysAhead = BACKEND_POLICY_DEFAULTS.MAX_BOOKING_DAYS_AHEAD;
  let maxRegistrationsPerHourPerIp =
    BACKEND_POLICY_DEFAULTS.MAX_REGISTRATIONS_PER_HOUR_PER_IP;
  let maxWorkspaceCreationsPerHourPerUser =
    BACKEND_POLICY_DEFAULTS.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER;
  let maxRoomCreationsPerHourPerUser =
    BACKEND_POLICY_DEFAULTS.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER;
  let maxInvitationCreationsPerHourPerUser =
    BACKEND_POLICY_DEFAULTS.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER;
  let maxBookingCreationsPerHourPerUser =
    BACKEND_POLICY_DEFAULTS.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER;
  let rateLimitSuspensionHours = BACKEND_POLICY_DEFAULTS.RATE_LIMIT_SUSPENSION_HOURS;
  try {
    emailVerificationTtlMinutes = parsePositiveInteger(
      config.EMAIL_VERIFICATION_TTL_MINUTES,
      BACKEND_POLICY_DEFAULTS.EMAIL_VERIFICATION_TTL_MINUTES,
      'EMAIL_VERIFICATION_TTL_MINUTES',
    );
    passwordResetTtlMinutes = parsePositiveInteger(
      config.PASSWORD_RESET_TTL_MINUTES,
      BACKEND_POLICY_DEFAULTS.PASSWORD_RESET_TTL_MINUTES,
      'PASSWORD_RESET_TTL_MINUTES',
    );
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    maxWorkspacesPerUser = parsePositiveInteger(
      config.MAX_WORKSPACES_PER_USER,
      BACKEND_POLICY_DEFAULTS.MAX_WORKSPACES_PER_USER,
      'MAX_WORKSPACES_PER_USER',
    );
    maxRoomsPerWorkspace = parsePositiveInteger(
      config.MAX_ROOMS_PER_WORKSPACE,
      BACKEND_POLICY_DEFAULTS.MAX_ROOMS_PER_WORKSPACE,
      'MAX_ROOMS_PER_WORKSPACE',
    );
    maxUsersPerWorkspace = parsePositiveInteger(
      config.MAX_USERS_PER_WORKSPACE,
      BACKEND_POLICY_DEFAULTS.MAX_USERS_PER_WORKSPACE,
      'MAX_USERS_PER_WORKSPACE',
    );
    maxPendingInvitationsPerWorkspace = parsePositiveInteger(
      config.MAX_PENDING_INVITATIONS_PER_WORKSPACE,
      BACKEND_POLICY_DEFAULTS.MAX_PENDING_INVITATIONS_PER_WORKSPACE,
      'MAX_PENDING_INVITATIONS_PER_WORKSPACE',
    );
    maxFutureBookingsPerUserPerWorkspace = parsePositiveInteger(
      config.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE,
      BACKEND_POLICY_DEFAULTS.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE,
      'MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE',
    );
    maxBookingDaysAhead = parsePositiveInteger(
      config.MAX_BOOKING_DAYS_AHEAD,
      BACKEND_POLICY_DEFAULTS.MAX_BOOKING_DAYS_AHEAD,
      'MAX_BOOKING_DAYS_AHEAD',
    );
    maxRegistrationsPerHourPerIp = parsePositiveInteger(
      config.MAX_REGISTRATIONS_PER_HOUR_PER_IP,
      BACKEND_POLICY_DEFAULTS.MAX_REGISTRATIONS_PER_HOUR_PER_IP,
      'MAX_REGISTRATIONS_PER_HOUR_PER_IP',
    );
    maxWorkspaceCreationsPerHourPerUser = parsePositiveInteger(
      config.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER,
      BACKEND_POLICY_DEFAULTS.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER,
      'MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER',
    );
    maxRoomCreationsPerHourPerUser = parsePositiveInteger(
      config.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER,
      BACKEND_POLICY_DEFAULTS.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER,
      'MAX_ROOM_CREATIONS_PER_HOUR_PER_USER',
    );
    maxInvitationCreationsPerHourPerUser = parsePositiveInteger(
      config.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER,
      BACKEND_POLICY_DEFAULTS.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER,
      'MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER',
    );
    maxBookingCreationsPerHourPerUser = parsePositiveInteger(
      config.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER,
      BACKEND_POLICY_DEFAULTS.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER,
      'MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER',
    );
    rateLimitSuspensionHours = parsePositiveInteger(
      config.RATE_LIMIT_SUSPENSION_HOURS,
      BACKEND_POLICY_DEFAULTS.RATE_LIMIT_SUSPENSION_HOURS,
      'RATE_LIMIT_SUSPENSION_HOURS',
    );
  } catch (error) {
    errors.push((error as Error).message);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${errors.join('; ')}`);
  }

  return {
    NODE_ENV: nodeEnv,
    API_PORT: apiPort,
    DATABASE_URL: databaseUrl,
    TRUSTED_PROXY_IPS: trustedProxyIps,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_ACCESS_TTL: jwtAccessTtl,
    JWT_REFRESH_TTL: jwtRefreshTtl,
    EMAIL_VERIFICATION_TTL_MINUTES: emailVerificationTtlMinutes,
    PASSWORD_RESET_TTL_MINUTES: passwordResetTtlMinutes,
    MAX_WORKSPACES_PER_USER: maxWorkspacesPerUser,
    MAX_ROOMS_PER_WORKSPACE: maxRoomsPerWorkspace,
    MAX_USERS_PER_WORKSPACE: maxUsersPerWorkspace,
    MAX_PENDING_INVITATIONS_PER_WORKSPACE: maxPendingInvitationsPerWorkspace,
    MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE: maxFutureBookingsPerUserPerWorkspace,
    MAX_BOOKING_DAYS_AHEAD: maxBookingDaysAhead,
    MAX_REGISTRATIONS_PER_HOUR_PER_IP: maxRegistrationsPerHourPerIp,
    MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER: maxWorkspaceCreationsPerHourPerUser,
    MAX_ROOM_CREATIONS_PER_HOUR_PER_USER: maxRoomCreationsPerHourPerUser,
    MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER: maxInvitationCreationsPerHourPerUser,
    MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER: maxBookingCreationsPerHourPerUser,
    RATE_LIMIT_SUSPENSION_HOURS: rateLimitSuspensionHours,
  };
}
