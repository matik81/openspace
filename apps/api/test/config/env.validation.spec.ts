import { validateEnv } from '../../src/config/env.validation';

describe('validateEnv', () => {
  it('returns normalized environment values', () => {
    const result = validateEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
      JWT_ACCESS_SECRET: '1234567890abcdef',
      JWT_REFRESH_SECRET: 'abcdef1234567890',
    });

    expect(result.API_PORT).toBe(4000);
    expect(result.TRUSTED_PROXY_IPS).toEqual(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
    expect(result.JWT_ACCESS_TTL).toBe('15m');
    expect(result.JWT_REFRESH_TTL).toBe('7d');
  });

  it('parses TRUSTED_PROXY_IPS when provided', () => {
    const result = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
      TRUSTED_PROXY_IPS: '10.0.0.10, 10.0.0.11',
      JWT_ACCESS_SECRET: '1234567890abcdef',
      JWT_REFRESH_SECRET: 'abcdef1234567890',
    });

    expect(result.TRUSTED_PROXY_IPS).toEqual(['10.0.0.10', '10.0.0.11']);
  });

  it('throws when TRUSTED_PROXY_IPS contains invalid values', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
        TRUSTED_PROXY_IPS: '127.0.0.1, not-an-ip',
        JWT_ACCESS_SECRET: '1234567890abcdef',
        JWT_REFRESH_SECRET: 'abcdef1234567890',
      }),
    ).toThrow('Invalid environment variables');
  });

  it('throws when required values are invalid', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'not-a-url',
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow('Invalid environment variables');
  });
});
