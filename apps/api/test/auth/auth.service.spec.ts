import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service';
import { EmailProvider } from '../../src/auth/email/email-provider.interface';
import { PrismaService } from '../../src/prisma/prisma.service';

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: '1234567890abcdef',
    JWT_REFRESH_SECRET: 'abcdef1234567890',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    EMAIL_VERIFICATION_TTL_MINUTES: '60',
  };

  return {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key];
      if (!value) {
        throw new Error(`Missing ${key}`);
      }
      return value;
    }),
  } as unknown as ConfigService;
}

function createPrismaService(): PrismaService {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
}

describe('AuthService', () => {
  it('registers a new user and sends verification email', async () => {
    const prismaService = createPrismaService();
    const emailProvider: EmailProvider = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prismaService.user.create as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
    });
    (prismaService.emailVerificationToken.create as jest.Mock).mockResolvedValue({
      id: 'token-id',
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      emailProvider,
    );

    const result = await service.register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'USER@EXAMPLE.COM',
      password: 'strong-password',
    });

    expect(prismaService.user.create).toHaveBeenCalled();
    expect(prismaService.emailVerificationToken.create).toHaveBeenCalled();
    expect(emailProvider.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      token: expect.any(String),
    });
    expect(result).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      requiresEmailVerification: true,
    });
  });

  it('blocks login when email is not verified', async () => {
    const prismaService = createPrismaService();
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'user@example.com',
      passwordHash: hashSync('strong-password', 12),
      emailVerifiedAt: null,
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      { sendVerificationEmail: jest.fn() },
    );

    await expect(
      service.login({
        email: 'user@example.com',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email must be verified before login',
      },
    });
  });

  it('rejects verification with an invalid token', async () => {
    const prismaService = createPrismaService();
    (prismaService.emailVerificationToken.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      { sendVerificationEmail: jest.fn() },
    );

    await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(
      'Verification token is invalid or expired',
    );
  });
});
