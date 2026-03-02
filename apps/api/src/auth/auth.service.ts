import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BookingCancellationReason,
  BookingStatus,
  MembershipStatus,
  User,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { OperationLimitsService } from '../common/operation-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EMAIL_PROVIDER, EmailProvider } from './email/email-provider.interface';
import { JwtSubject } from './types/jwt-subject.type';

type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

type JwtBaseSubject = Omit<JwtSubject, 'tokenType'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly operationLimitsService: OperationLimitsService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async register(dto: RegisterDto): Promise<{
    id: string;
    email: string;
    requiresEmailVerification: true;
  }> {
    return this.registerWithContext(dto, { ipAddress: 'unknown' });
  }

  async registerWithContext(
    dto: RegisterDto,
    context: { ipAddress: string },
  ): Promise<{
    id: string;
    email: string;
    requiresEmailVerification: true;
  }> {
    await this.operationLimitsService.assertRegistrationAllowed(context.ipAddress);
    const firstName = this.requireString(dto.firstName, 'firstName');
    const lastName = this.requireString(dto.lastName, 'lastName');
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');

    if (password.length < 8) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters',
      });
    }

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingUser && existingUser.status !== UserStatus.CANCELLED) {
      throw new ConflictException({
        code: 'USER_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await hash(password, 12);
    const verificationToken = this.generateOpaqueToken();
    const verificationTokenCreatedAt = new Date();
    const user = await this.prismaService.$transaction(async (tx) => {
      const persistedUser =
        existingUser?.status === UserStatus.CANCELLED
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: {
                firstName,
                lastName,
                passwordHash,
                status: UserStatus.ACTIVE,
                cancelledAt: null,
                emailVerifiedAt: null,
                refreshTokenHash: null,
                refreshTokenExpiresAt: null,
              },
              select: {
                id: true,
                email: true,
              },
            })
          : await tx.user.create({
              data: {
                firstName,
                lastName,
                email,
                passwordHash,
              },
              select: {
                id: true,
                email: true,
              },
            });

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: persistedUser.id,
          consumedAt: null,
        },
        data: {
          consumedAt: verificationTokenCreatedAt,
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: persistedUser.id,
          tokenHash: this.hashToken(verificationToken),
          expiresAt: this.buildEmailVerificationExpiration(),
        },
      });

      return persistedUser;
    });

    await this.emailProvider.sendVerificationEmail({
      to: user.email,
      token: verificationToken,
    });
    await this.operationLimitsService.recordRegistration(context.ipAddress);

    return {
      id: user.id,
      email: user.email,
      requiresEmailVerification: true,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ verified: true }> {
    const token = this.requireString(dto.token, 'token');
    const now = new Date();

    const verificationRecord = await this.prismaService.emailVerificationToken.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!verificationRecord) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TOKEN',
        message: 'Verification token is invalid or expired',
      });
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: verificationRecord.userId },
        data: {
          emailVerifiedAt: now,
        },
      });

      await tx.emailVerificationToken.update({
        where: { id: verificationRecord.id },
        data: { consumedAt: now },
      });

      await tx.emailVerificationToken.updateMany({
        where: {
          userId: verificationRecord.userId,
          consumedAt: null,
          id: { not: verificationRecord.id },
        },
        data: {
          consumedAt: now,
        },
      });
    });

    return { verified: true };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ requested: true }> {
    const email = this.normalizeEmail(dto.email);
    const now = new Date();
    const user = await this.prismaService.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      return { requested: true };
    }

    await this.operationLimitsService.assertUserAuthenticationAllowed(user.id);

    const token = this.generateOpaqueToken();

    await this.prismaService.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt: now,
        },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: this.buildPasswordResetExpiration(),
        },
      });
    });

    await this.emailProvider.sendPasswordResetEmail({
      to: user.email,
      token,
    });

    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ reset: true }> {
    const token = this.requireString(dto.token, 'token');
    const password = this.requireString(dto.password, 'password');

    if (password.length < 8) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters',
      });
    }

    const now = new Date();
    const passwordResetRecord = await this.prismaService.passwordResetToken.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!passwordResetRecord) {
      throw new BadRequestException({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
        message: 'Password reset token is invalid or expired',
      });
    }

    await this.operationLimitsService.assertUserAuthenticationAllowed(passwordResetRecord.userId);

    const passwordHash = await hash(password, 12);

    await this.prismaService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: passwordResetRecord.userId },
        data: {
          passwordHash,
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });

      await tx.passwordResetToken.update({
        where: { id: passwordResetRecord.id },
        data: { consumedAt: now },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: passwordResetRecord.userId,
          consumedAt: null,
          id: { not: passwordResetRecord.id },
        },
        data: { consumedAt: now },
      });
    });

    return { reset: true };
  }

  async login(dto: LoginDto): Promise<
    AuthTokenPair & { user: { id: string; email: string; firstName: string; lastName: string } }
  > {
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');
    const user = await this.prismaService.user.findUnique({
      where: { email },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }

    this.assertUserActive(user.status ?? UserStatus.ACTIVE);
    this.assertEmailVerified(user.emailVerifiedAt);
    await this.operationLimitsService.assertUserAuthenticationAllowed(user.id);
    const tokens = await this.issueTokenPair(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      ...tokens,
    };
  }

  async me(authUser: { userId: string }): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: authUser.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    this.assertUserActive(user.status ?? UserStatus.ACTIVE);
    this.assertEmailVerified(user.emailVerifiedAt);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async updateAccount(
    authUser: { userId: string },
    dto: UpdateAccountDto,
  ): Promise<{ id: string; email: string; firstName: string; lastName: string }> {
    const userId = this.requireUuid(authUser.userId, 'userId');
    const firstName = this.requireString(dto.firstName, 'firstName');
    const lastName = this.requireString(dto.lastName, 'lastName');
    const newPassword = dto.newPassword?.trim() ? dto.newPassword.trim() : null;

    if (newPassword && newPassword.length < 8) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 8 characters',
      });
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    this.assertUserActive(user.status);

    return this.prismaService.user.update({
      where: { id: user.id },
      data: {
        firstName,
        lastName,
        passwordHash: newPassword ? await hash(newPassword, 12) : undefined,
        refreshTokenHash: newPassword ? null : undefined,
        refreshTokenExpiresAt: newPassword ? null : undefined,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokenPair> {
    const refreshToken = this.requireString(dto.refreshToken, 'refreshToken');
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    this.assertUserActive(user.status ?? UserStatus.ACTIVE);
    this.assertEmailVerified(user.emailVerifiedAt);

    if (!user.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    if (user.refreshTokenExpiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Refresh token expired',
      });
    }

    if (this.hashToken(refreshToken) !== user.refreshTokenHash) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    return this.issueTokenPair(user);
  }

  async deleteAccount(
    authUser: { userId: string },
    dto: DeleteAccountDto,
  ): Promise<{ cancelled: true }> {
    const userId = this.requireUuid(authUser.userId, 'userId');
    const email = this.normalizeEmail(dto.email);
    const password = this.requireString(dto.password, 'password');
    const now = new Date();

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    this.assertUserActive(user.status);

    if (user.email !== email || !(await compare(password, user.passwordHash))) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DELETE_CONFIRMATION_FAILED',
        message: 'Account deletion confirmation failed',
      });
    }

    await this.prismaService.$transaction(async (tx) => {
      const memberships = await tx.workspaceMember.findMany({
        where: {
          userId: user.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          workspaceId: true,
          role: true,
        },
      });

      const participantWorkspaceIds = memberships
        .filter((membership) => membership.role !== WorkspaceRole.ADMIN)
        .map((membership) => membership.workspaceId);
      const adminWorkspaceIds = memberships
        .filter((membership) => membership.role === WorkspaceRole.ADMIN)
        .map((membership) => membership.workspaceId);

      if (participantWorkspaceIds.length > 0) {
        await tx.workspaceMember.updateMany({
          where: {
            userId: user.id,
            workspaceId: { in: participantWorkspaceIds },
            status: MembershipStatus.ACTIVE,
          },
          data: {
            status: MembershipStatus.INACTIVE,
          },
        });

        await tx.booking.updateMany({
          where: {
            createdByUserId: user.id,
            workspaceId: { in: participantWorkspaceIds },
            status: BookingStatus.ACTIVE,
            startAt: { gte: now },
          },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
          },
        });
      }

      if (adminWorkspaceIds.length > 0) {
        await tx.workspace.updateMany({
          where: {
            id: { in: adminWorkspaceIds },
            status: WorkspaceStatus.ACTIVE,
          },
          data: {
            status: WorkspaceStatus.CANCELLED,
            cancelledAt: now,
          },
        });
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.CANCELLED,
          cancelledAt: now,
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });
    });

    return { cancelled: true };
  }

  async getRegistrationStatus(context: { ipAddress: string }): Promise<{ allowed: true }> {
    await this.operationLimitsService.assertRegistrationStatusAllowed(context.ipAddress);
    return { allowed: true };
  }

  private async signAccessToken(payload: JwtBaseSubject): Promise<string> {
    return this.jwtService.signAsync(
      {
        ...payload,
        tokenType: 'access',
      } as JwtSubject,
      {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL', '15m'),
      },
    );
  }

  private async signRefreshToken(payload: JwtBaseSubject): Promise<string> {
    return this.jwtService.signAsync(
      {
        ...payload,
        tokenType: 'refresh',
      } as JwtSubject,
      {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_TTL', '7d'),
      },
    );
  }

  private async verifyRefreshToken(token: string): Promise<JwtSubject> {
    const payload = await this.jwtService.verifyAsync<JwtSubject>(token, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    return payload;
  }

  private async issueTokenPair(user: User): Promise<AuthTokenPair> {
    const payload: JwtBaseSubject = {
      sub: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    };

    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.signRefreshToken(payload);
    const decodedRefresh = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const refreshTokenExpiresAt = decodedRefresh?.exp
      ? new Date(decodedRefresh.exp * 1000)
      : this.buildRefreshExpirationFallback();

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: this.hashToken(refreshToken),
        refreshTokenExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private assertEmailVerified(emailVerifiedAt: Date | null): void {
    if (!emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email must be verified before login',
      });
    }
  }

  private assertUserActive(status: UserStatus): void {
    if (status === UserStatus.ACTIVE) {
      return;
    }

    throw new ForbiddenException({
      code: 'ACCOUNT_CANCELLED',
      message: 'Account is no longer active',
    });
  }

  private requireString(value: string | undefined | null, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} is required`,
      });
    }

    return value.trim();
  }

  private normalizeEmail(value: string | undefined | null): string {
    return this.requireString(value, 'email').toLowerCase();
  }

  private requireUuid(value: string | undefined | null, fieldName: string): string {
    const normalized = this.requireString(value, fieldName);
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(normalized)) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: `${fieldName} must be a valid UUID`,
      });
    }

    return normalized;
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('hex');
  }

  private buildEmailVerificationExpiration(): Date {
    const ttlMinutes = this.configService.get<number>('EMAIL_VERIFICATION_TTL_MINUTES', 60);
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private buildPasswordResetExpiration(): Date {
    const ttlMinutes = this.configService.get<number>('PASSWORD_RESET_TTL_MINUTES', 60);
    return new Date(Date.now() + ttlMinutes * 60 * 1000);
  }

  private buildRefreshExpirationFallback(): Date {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + sevenDaysMs);
  }
}
