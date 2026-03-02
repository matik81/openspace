import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service';
import { EmailProvider } from '../../src/auth/email/email-provider.interface';
import { OperationLimitsService } from '../../src/common/operation-limits.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function createConfigService(): ConfigService {
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: '1234567890abcdef',
    JWT_REFRESH_SECRET: 'abcdef1234567890',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    EMAIL_VERIFICATION_TTL_MINUTES: '60',
    PASSWORD_RESET_TTL_MINUTES: '60',
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

function createOperationLimitsService(): OperationLimitsService {
  return {
    assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined),
    assertRegistrationStatusAllowed: jest.fn().mockResolvedValue(undefined),
    recordRegistration: jest.fn().mockResolvedValue(undefined),
    assertUserAuthenticationAllowed: jest.fn().mockResolvedValue(undefined),
  } as unknown as OperationLimitsService;
}

function createPrismaService(): PrismaService {
  const delegates = {
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
    passwordResetToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  return {
    ...delegates,
    $transaction: jest.fn(
      async (callback: (tx: typeof delegates) => Promise<unknown>) => callback(delegates),
    ),
  } as unknown as PrismaService;
}

describe('AuthService', () => {
  it('registers a new user and sends verification email', async () => {
    const prismaService = createPrismaService();
    const emailProvider: EmailProvider = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
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
      createOperationLimitsService(),
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
      createOperationLimitsService(),
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
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
      createOperationLimitsService(),
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
    );

    await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(
      'Verification token is invalid or expired',
    );
  });

  it('reactivates a cancelled user on registration with the same email', async () => {
    const prismaService = createPrismaService();
    const emailProvider: EmailProvider = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    const transactionDelegates = {
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'cancelled-user-id',
          email: 'user@example.com',
        }),
        create: jest.fn(),
      },
      emailVerificationToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'token-id' }),
      },
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'cancelled-user-id',
      status: 'CANCELLED',
    });
    (prismaService.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof transactionDelegates) => Promise<unknown>) =>
        callback(transactionDelegates),
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      emailProvider,
    );

    const result = await service.register({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'user@example.com',
      password: 'strong-password',
    });

    expect(transactionDelegates.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cancelled-user-id' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          cancelledAt: null,
          emailVerifiedAt: null,
        }),
      }),
    );
    expect(transactionDelegates.user.create).not.toHaveBeenCalled();
    expect(emailProvider.sendVerificationEmail).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'cancelled-user-id',
      email: 'user@example.com',
      requiresEmailVerification: true,
    });
  });

  it('updates account details after confirming current credentials', async () => {
    const prismaService = createPrismaService();
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashSync('current-password', 12),
      status: 'ACTIVE',
    });
    (prismaService.user.update as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Updated',
      lastName: 'User',
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
    );

    const result = await service.updateAccount(
      { userId: 'b4724cda-0e07-4f84-a2d5-393472e8c98a' },
      {
        firstName: 'Updated',
        lastName: 'User',
        newPassword: 'next-password',
      },
    );

    expect(prismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: 'Updated',
          lastName: 'User',
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        }),
      }),
    );
    expect(result).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Updated',
      lastName: 'User',
    });
  });

  it('requests a password reset without failing for an active verified user', async () => {
    const prismaService = createPrismaService();
    const operationLimitsService = createOperationLimitsService();
    const emailProvider: EmailProvider = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    const transactionDelegates = {
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'reset-token-id' }),
      },
    };

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
    (prismaService.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof transactionDelegates) => Promise<unknown>) =>
        callback(transactionDelegates),
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      operationLimitsService,
      emailProvider,
    );

    const result = await service.requestPasswordReset({ email: 'user@example.com' });

    expect(operationLimitsService.assertUserAuthenticationAllowed).toHaveBeenCalledWith('user-id');
    expect(transactionDelegates.passwordResetToken.create).toHaveBeenCalled();
    expect(emailProvider.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      token: expect.any(String),
    });
    expect(result).toEqual({ requested: true });
  });

  it('blocks password reset requests for suspended users', async () => {
    const prismaService = createPrismaService();
    const operationLimitsService = createOperationLimitsService();
    const suspensionError = Object.assign(new Error('User suspended'), {
      response: { code: 'USER_SUSPENDED' },
    });

    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
    (operationLimitsService.assertUserAuthenticationAllowed as jest.Mock).mockRejectedValue(
      suspensionError,
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      operationLimitsService,
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
    );

    await expect(service.requestPasswordReset({ email: 'user@example.com' })).rejects.toBe(
      suspensionError,
    );
    expect(prismaService.$transaction).not.toHaveBeenCalled();
  });

  it('resets password with a valid token', async () => {
    const prismaService = createPrismaService();
    const operationLimitsService = createOperationLimitsService();
    const transactionDelegates = {
      user: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      passwordResetToken: {
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue({
      id: 'reset-token-id',
      userId: 'user-id',
    });
    (prismaService.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof transactionDelegates) => Promise<unknown>) =>
        callback(transactionDelegates),
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      operationLimitsService,
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
    );

    const result = await service.resetPassword({
      token: 'plain-token',
      password: 'new-strong-password',
    });

    expect(operationLimitsService.assertUserAuthenticationAllowed).toHaveBeenCalledWith('user-id');
    expect(transactionDelegates.user.update).toHaveBeenCalled();
    expect(transactionDelegates.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: 'reset-token-id' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(result).toEqual({ reset: true });
  });

  it('blocks password reset confirmation for suspended users', async () => {
    const prismaService = createPrismaService();
    const operationLimitsService = createOperationLimitsService();
    const suspensionError = Object.assign(new Error('User suspended'), {
      response: { code: 'USER_SUSPENDED' },
    });

    (prismaService.passwordResetToken.findFirst as jest.Mock).mockResolvedValue({
      id: 'reset-token-id',
      userId: 'user-id',
    });
    (operationLimitsService.assertUserAuthenticationAllowed as jest.Mock).mockRejectedValue(
      suspensionError,
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      operationLimitsService,
      {
        sendVerificationEmail: jest.fn(),
        sendPasswordResetEmail: jest.fn(),
      },
    );

    await expect(
      service.resetPassword({
        token: 'plain-token',
        password: 'new-strong-password',
      }),
    ).rejects.toBe(suspensionError);
    expect(prismaService.$transaction).not.toHaveBeenCalled();
  });
});
