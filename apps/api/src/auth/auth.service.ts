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
  InvitationStatus,
  MembershipStatus,
  User,
  UserStatus,
  WorkspaceStatus,
} from '../generated/prisma';
import {
  OPAQUE_TOKEN_MAX_LENGTH,
  PASSWORD_MAX_UTF8_BYTES,
  REFRESH_TOKEN_MAX_LENGTH,
  STRING_LENGTH_LIMITS,
} from '@openspace/shared';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import {
  assertMaxUtf8ByteLength,
  requirePassword as requireBoundedPassword,
  requireTrimmedString,
} from '../common/string-field-validation';
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
type RegisterResult = {
  id: string;
  email: string;
  requiresEmailVerification: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly operationLimitsService: OperationLimitsService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    return this.registerWithContext(dto, { ipAddress: 'unknown' });
  }

  async registerWithContext(dto: RegisterDto, context: { ipAddress: string }): Promise<RegisterResult> {
    await this.operationLimitsService.assertRegistrationAllowed(context.ipAddress);
    const invitationToken = this.optionalString(
      dto.invitationToken,
      'invitationToken',
      OPAQUE_TOKEN_MAX_LENGTH,
    );

    if (invitationToken) {
      return this.registerWithInvitation(dto, invitationToken, context);
    }

    return this.registerWithEmailVerification(dto, context);
  }

  async getInvitationRegistrationContext(token: string): Promise<{
    email: string;
    workspaceName: string;
    inviterName: string;
    expiresAt: Date;
  }> {
    const invitation = await this.findInvitationRegistrationContext(token);

    return {
      email: invitation.email,
      workspaceName: invitation.workspaceName,
      inviterName: invitation.inviterName,
      expiresAt: invitation.expiresAt,
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ verified: true }> {
    const token = this.requireString(dto.token, 'token', OPAQUE_TOKEN_MAX_LENGTH);
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
    const token = this.requireString(dto.token, 'token', OPAQUE_TOKEN_MAX_LENGTH);
    const password = this.requirePassword(dto.password);

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
    const password = this.requirePasswordInput(dto.password);
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
    const firstName = this.requireString(
      dto.firstName,
      'firstName',
      STRING_LENGTH_LIMITS.userFirstName,
    );
    const lastName = this.requireString(
      dto.lastName,
      'lastName',
      STRING_LENGTH_LIMITS.userLastName,
    );
    const currentPassword =
      dto.currentPassword?.trim()
        ? this.requirePasswordInput(dto.currentPassword, 'currentPassword')
        : null;
    const newPassword = dto.newPassword?.trim()
      ? this.requirePassword(dto.newPassword, 'newPassword')
      : null;

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

    if (newPassword && !currentPassword) {
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_REQUIRED',
        message: 'currentPassword is required when changing password',
      });
    }

    if (newPassword && !(await compare(currentPassword!, user.passwordHash))) {
      throw new ForbiddenException({
        code: 'ACCOUNT_UPDATE_CONFIRMATION_FAILED',
        message: 'Account update confirmation failed',
      });
    }

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
    const refreshToken = this.requireString(
      dto.refreshToken,
      'refreshToken',
      REFRESH_TOKEN_MAX_LENGTH,
    );
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

  async logout(dto: RefreshTokenDto): Promise<{ loggedOut: true }> {
    const refreshToken = this.requireString(
      dto.refreshToken,
      'refreshToken',
      REFRESH_TOKEN_MAX_LENGTH,
    );
    let payload: JwtSubject;

    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      // Keep logout idempotent even when the client presents an invalid or expired token.
      return { loggedOut: true };
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        refreshTokenHash: true,
      },
    });

    if (user && user.refreshTokenHash === this.hashToken(refreshToken)) {
      await this.prismaService.user.update({
        where: { id: user.id },
        data: {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });
    }

    return { loggedOut: true };
  }

  async deleteAccount(
    authUser: { userId: string },
    dto: DeleteAccountDto,
  ): Promise<{ cancelled: true }> {
    const userId = this.requireUuid(authUser.userId, 'userId');
    const email = this.normalizeEmail(dto.email);
    const password = this.requirePasswordInput(dto.password);
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
        },
      });
      const ownedWorkspaces = await tx.workspace.findMany({
        where: {
          createdByUserId: user.id,
          status: WorkspaceStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      const ownedWorkspaceIds = ownedWorkspaces.map((workspace) => workspace.id);
      const ownedWorkspaceIdSet = new Set(ownedWorkspaceIds);
      const participantWorkspaceIds = memberships
        .map((membership) => membership.workspaceId)
        .filter((workspaceId) => !ownedWorkspaceIdSet.has(workspaceId));

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

      if (ownedWorkspaceIds.length > 0) {
        await tx.workspace.updateMany({
          where: {
            id: { in: ownedWorkspaceIds },
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

  private requireString(
    value: string | undefined | null,
    fieldName: string,
    maxLength?: number,
  ): string {
    return requireTrimmedString(value, fieldName, { maxLength });
  }

  private async registerWithEmailVerification(
    dto: RegisterDto,
    context: { ipAddress: string },
  ): Promise<RegisterResult> {
    const firstName = this.requireString(
      dto.firstName,
      'firstName',
      STRING_LENGTH_LIMITS.userFirstName,
    );
    const lastName = this.requireString(
      dto.lastName,
      'lastName',
      STRING_LENGTH_LIMITS.userLastName,
    );
    const email = this.normalizeEmail(dto.email);
    const password = this.requirePassword(dto.password);

    const existingUser = await this.prismaService.user.findUnique({
      where: { email },
      select: {
        id: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (existingUser?.status === UserStatus.ACTIVE && existingUser.emailVerifiedAt) {
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
        existingUser
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

  private async registerWithInvitation(
    dto: RegisterDto,
    invitationToken: string,
    context: { ipAddress: string },
  ): Promise<RegisterResult> {
    const invitation = await this.findInvitationRegistrationContext(invitationToken);
    const firstName = this.requireString(
      dto.firstName,
      'firstName',
      STRING_LENGTH_LIMITS.userFirstName,
    );
    const lastName = this.requireString(
      dto.lastName,
      'lastName',
      STRING_LENGTH_LIMITS.userLastName,
    );
    const password = this.requirePassword(dto.password);
    const providedEmail = this.optionalEmail(dto.email);

    if (providedEmail && providedEmail !== invitation.email) {
      throw new BadRequestException({
        code: 'INVITATION_EMAIL_MISMATCH',
        message: 'Invitation email must match the invited email address',
      });
    }

    const existingUser = await this.prismaService.user.findUnique({
      where: { email: invitation.email },
      select: {
        id: true,
        status: true,
        emailVerifiedAt: true,
      },
    });

    if (existingUser?.status === UserStatus.ACTIVE && existingUser.emailVerifiedAt) {
      throw new ConflictException({
        code: 'USER_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await hash(password, 12);
    const verifiedAt = new Date();
    const user = await this.prismaService.$transaction(async (tx) => {
      const persistedUser =
        existingUser
          ? await tx.user.update({
              where: { id: existingUser.id },
              data: {
                firstName,
                lastName,
                passwordHash,
                status: UserStatus.ACTIVE,
                cancelledAt: null,
                emailVerifiedAt: verifiedAt,
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
                email: invitation.email,
                passwordHash,
                emailVerifiedAt: verifiedAt,
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
          consumedAt: verifiedAt,
        },
      });

      return persistedUser;
    });

    await this.operationLimitsService.recordRegistration(context.ipAddress);

    return {
      id: user.id,
      email: user.email,
      requiresEmailVerification: false,
    };
  }

  private async findInvitationRegistrationContext(token: string): Promise<{
    id: string;
    email: string;
    workspaceName: string;
    inviterName: string;
    expiresAt: Date;
  }> {
    const invitationToken = this.requireString(token, 'token', OPAQUE_TOKEN_MAX_LENGTH);
    const now = new Date();
    const invitation = await this.prismaService.invitation.findFirst({
      where: {
        tokenHash: this.hashToken(invitationToken),
        status: InvitationStatus.PENDING,
      },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        workspace: {
          select: {
            name: true,
            status: true,
          },
        },
        invitedByUser: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!invitation || invitation.workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION_TOKEN',
        message: 'Invitation token is invalid',
      });
    }

    if (invitation.expiresAt <= now) {
      await this.prismaService.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ConflictException({
        code: 'INVITATION_EXPIRED',
        message: 'Invitation has expired',
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      workspaceName: invitation.workspace.name,
      inviterName: this.formatDisplayName(invitation.invitedByUser),
      expiresAt: invitation.expiresAt,
    };
  }

  private normalizeEmail(value: string | undefined | null): string {
    return this.requireString(value, 'email', STRING_LENGTH_LIMITS.userEmail).toLowerCase();
  }

  private optionalEmail(value: string | undefined | null): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return this.normalizeEmail(value);
  }

  private optionalString(
    value: string | undefined | null,
    fieldName: string,
    maxLength?: number,
  ): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return null;
    }

    return this.requireString(value, fieldName, maxLength);
  }

  private requirePassword(
    value: string | undefined | null,
    fieldName = 'password',
  ): string {
    return requireBoundedPassword(value, fieldName);
  }

  private requirePasswordInput(
    value: string | undefined | null,
    fieldName = 'password',
  ): string {
    const password = this.requireString(value, fieldName);
    assertMaxUtf8ByteLength(password, fieldName, PASSWORD_MAX_UTF8_BYTES);
    return password;
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
    return randomBytes(16).toString('hex');
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

  private formatDisplayName(user: { firstName: string; lastName: string }): string {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    return fullName.length > 0 ? fullName : 'OpenSpace admin';
  }
}

