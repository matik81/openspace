import { validateEnv } from '../../src/config/env.validation';

describe('validateEnv', () => {
  it('returns normalized environment values', () => {
    const result = validateEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: '1234567890abcdef',
      JWT_REFRESH_SECRET: 'abcdef1234567890',
    });

    expect(result.API_PORT).toBe(4000);
    expect(result.JWT_ACCESS_TTL).toBe('15m');
    expect(result.JWT_REFRESH_TTL).toBe('7d');
  });

  it('throws when required values are invalid', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'not-a-url',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow('Invalid environment variables');
  });
});

