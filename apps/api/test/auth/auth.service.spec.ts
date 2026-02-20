import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../src/auth/auth.service';
import { JwtSubject } from '../../src/auth/types/jwt-subject.type';

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: '1234567890abcdef',
    JWT_REFRESH_SECRET: 'abcdef1234567890',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  };

  return {
    get: jest.fn((key: string, fallback: string) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (!value) {
        throw new Error(`Missing ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

describe('AuthService', () => {
  it('signs and verifies access tokens', async () => {
    const configService = createConfigService();
    const service = new AuthService(new JwtService(), configService);
    const payload: JwtSubject = {
      sub: 'user-id',
      email: 'user@example.com',
      emailVerifiedAt: '2026-02-20T10:00:00.000Z',
    };

    const token = await service.signAccessToken(payload);
    const decoded = await service.verifyAccessToken(token);

    expect(token).toEqual(expect.any(String));
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
  });

  it('signs refresh tokens with refresh secret', async () => {
    const configService = createConfigService();
    const service = new AuthService(new JwtService(), configService);
    const payload: JwtSubject = { sub: 'user-id', email: 'user@example.com' };

    const token = await service.signRefreshToken(payload);

    expect(token).toEqual(expect.any(String));
  });
});

