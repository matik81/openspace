import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
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
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async register(dto: RegisterDto): Promise<{
    id: string;
    email: string;
    requiresEmailVerification: true;
  }> {
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
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'USER_ALREADY_EXISTS',
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await hash(password, 12);
    const user = await this.prismaService.user.create({
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

    const verificationToken = this.generateOpaqueToken();
    await this.prismaService.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(verificationToken),
        expiresAt: this.buildEmailVerificationExpiration(),
      },
    });

    await this.emailProvider.sendVerificationEmail({
      to: user.email,
      token: verificationToken,
    });

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

    this.assertEmailVerified(user.emailVerifiedAt);
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

  private buildRefreshExpirationFallback(): Date {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + sevenDaysMs);
  }
}
