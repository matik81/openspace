type EnvInput = Record<string, unknown>;

type ValidatedEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  API_PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL: string;
  EMAIL_VERIFICATION_TTL_MINUTES: number;
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

function assertUrl(name: string, value: unknown): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} is required`);
  }

  try {
    // URL parsing ensures basic URI structure.
    new URL(value);
    return value;
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
  let redisUrl = '';
  let jwtAccessSecret = '';
  let jwtRefreshSecret = '';

  try {
    databaseUrl = assertUrl('DATABASE_URL', config.DATABASE_URL);
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    redisUrl = assertUrl('REDIS_URL', config.REDIS_URL);
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
  let emailVerificationTtlMinutes = 60;
  try {
    emailVerificationTtlMinutes = parsePositiveInteger(
      config.EMAIL_VERIFICATION_TTL_MINUTES,
      60,
      'EMAIL_VERIFICATION_TTL_MINUTES',
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
    REDIS_URL: redisUrl,
    JWT_ACCESS_SECRET: jwtAccessSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    JWT_ACCESS_TTL: jwtAccessTtl,
    JWT_REFRESH_TTL: jwtRefreshTtl,
    EMAIL_VERIFICATION_TTL_MINUTES: emailVerificationTtlMinutes,
  };
}
