import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import { createHash } from 'crypto';
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
    invitation: {
      findFirst: jest.fn(),
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

function createEmailProvider(): EmailProvider {
  return {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendWorkspaceInvitationEmail: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AuthService', () => {
  it('registers a new user and sends verification email', async () => {
    const prismaService = createPrismaService();
    const emailProvider = createEmailProvider();

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

  it('registers with an invitation token and verifies the email immediately', async () => {
    const prismaService = createPrismaService();
    const emailProvider = createEmailProvider();
    const verifiedAt = new Date('2026-03-18T10:00:00.000Z');
    const transactionDelegates = {
      user: {
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'invited-user-id',
          email: 'invitee@example.com',
        }),
      },
      emailVerificationToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    (prismaService.invitation.findFirst as jest.Mock).mockResolvedValue({
      id: 'invitation-id',
      email: 'invitee@example.com',
      expiresAt: new Date('2026-03-25T10:00:00.000Z'),
      workspace: {
        name: 'Engineering',
        status: 'ACTIVE',
      },
      invitedByUser: {
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prismaService.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof transactionDelegates) => Promise<unknown>) =>
        callback(transactionDelegates),
    );

    jest.useFakeTimers().setSystemTime(verifiedAt);

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      emailProvider,
    );

    const result = await service.register({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'invitee@example.com',
      password: 'strong-password',
      invitationToken: 'invitation-token',
    });

    expect(prismaService.invitation.findFirst).toHaveBeenCalled();
    expect(transactionDelegates.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'invitee@example.com',
          emailVerifiedAt: verifiedAt,
        }),
      }),
    );
    expect(transactionDelegates.emailVerificationToken.updateMany).toHaveBeenCalled();
    expect(emailProvider.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'invited-user-id',
      email: 'invitee@example.com',
      requiresEmailVerification: false,
    });

    jest.useRealTimers();
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
      createEmailProvider(),
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
      createEmailProvider(),
    );

    await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(
      'Verification token is invalid or expired',
    );
  });

  it('reactivates a cancelled user on registration with the same email', async () => {
    const prismaService = createPrismaService();
    const emailProvider = createEmailProvider();
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

  it('restarts registration for an active user whose email is not verified', async () => {
    const prismaService = createPrismaService();
    const emailProvider = createEmailProvider();
    const transactionDelegates = {
      user: {
        update: jest.fn().mockResolvedValue({
          id: 'pending-user-id',
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
      id: 'pending-user-id',
      status: 'ACTIVE',
      emailVerifiedAt: null,
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
        where: { id: 'pending-user-id' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          cancelledAt: null,
          emailVerifiedAt: null,
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        }),
      }),
    );
    expect(transactionDelegates.user.create).not.toHaveBeenCalled();
    expect(emailProvider.sendVerificationEmail).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'pending-user-id',
      email: 'user@example.com',
      requiresEmailVerification: true,
    });
  });

  it('rejects registration when the existing user email is already verified', async () => {
    const prismaService = createPrismaService();
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'verified-user-id',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-03-18T10:00:00.000Z'),
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      createEmailProvider(),
    );

    await expect(
      service.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'user@example.com',
        password: 'strong-password',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'USER_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      },
    });
  });

  it('updates account details after confirming the current password for password changes', async () => {
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
      createEmailProvider(),
    );

    const result = await service.updateAccount(
      { userId: 'b4724cda-0e07-4f84-a2d5-393472e8c98a' },
      {
        firstName: 'Updated',
        lastName: 'User',
        currentPassword: 'current-password',
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

  it('requires currentPassword when changing password', async () => {
    const prismaService = createPrismaService();
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashSync('current-password', 12),
      status: 'ACTIVE',
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      createEmailProvider(),
    );

    await expect(
      service.updateAccount(
        { userId: 'b4724cda-0e07-4f84-a2d5-393472e8c98a' },
        {
          firstName: 'Updated',
          lastName: 'User',
          newPassword: 'next-password',
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENT_PASSWORD_REQUIRED',
      },
    });

    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('rejects password changes when currentPassword is wrong', async () => {
    const prismaService = createPrismaService();
    (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: hashSync('current-password', 12),
      status: 'ACTIVE',
    });

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      createEmailProvider(),
    );

    await expect(
      service.updateAccount(
        { userId: 'b4724cda-0e07-4f84-a2d5-393472e8c98a' },
        {
          firstName: 'Updated',
          lastName: 'User',
          currentPassword: 'wrong-password',
          newPassword: 'next-password',
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'ACCOUNT_UPDATE_CONFIRMATION_FAILED',
      },
    });

    expect(prismaService.user.update).not.toHaveBeenCalled();
  });

  it('revokes the stored refresh token on logout', async () => {
    const prismaService = createPrismaService();
    const verifiedAt = new Date('2025-01-01T00:00:00.000Z');
    const userRecord = {
      id: 'user-id',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'user@example.com',
      passwordHash: hashSync('strong-password', 12),
      emailVerifiedAt: verifiedAt,
      status: 'ACTIVE',
    };
    let storedRefreshTokenHash: string | null = null;

    (prismaService.user.findUnique as jest.Mock).mockImplementation(
      async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return userRecord;
        }

        if (where.id) {
          return {
            id: userRecord.id,
            refreshTokenHash: storedRefreshTokenHash,
          };
        }

        return null;
      },
    );
    (prismaService.user.update as jest.Mock).mockImplementation(
      async ({ data }: { data: { refreshTokenHash?: string | null } }) => {
        if (Object.prototype.hasOwnProperty.call(data, 'refreshTokenHash')) {
          storedRefreshTokenHash = data.refreshTokenHash ?? null;
        }

        return {
          id: userRecord.id,
        };
      },
    );

    const service = new AuthService(
      prismaService,
      new JwtService(),
      createConfigService(),
      createOperationLimitsService(),
      createEmailProvider(),
    );

    const loginResult = await service.login({
      email: userRecord.email,
      password: 'strong-password',
    });
    expect(storedRefreshTokenHash).toBe(
      createHash('sha256').update(loginResult.refreshToken).digest('hex'),
    );

    const result = await service.logout({ refreshToken: loginResult.refreshToken });

    expect(result).toEqual({ loggedOut: true });
    expect(prismaService.user.update).toHaveBeenLastCalledWith({
      where: { id: userRecord.id },
      data: {
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      },
    });
  });

  it('requests a password reset without failing for an active verified user', async () => {
    const prismaService = createPrismaService();
    const operationLimitsService = createOperationLimitsService();
    const emailProvider = createEmailProvider();
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
      createEmailProvider(),
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
      createEmailProvider(),
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
      createEmailProvider(),
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
