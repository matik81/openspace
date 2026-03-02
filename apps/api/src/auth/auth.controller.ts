import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtSubject } from './types/jwt-subject.type';

type AuthenticatedRequest = {
  user?: JwtSubject;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Req() request: AuthenticatedRequest, @Body() body: RegisterDto) {
    return this.authService.registerWithContext(body, {
      ipAddress: this.extractIpAddress(request),
    });
  }

  @Get('register-status')
  async getRegistrationStatus(@Req() request: AuthenticatedRequest) {
    return this.authService.getRegistrationStatus({
      ipAddress: this.extractIpAddress(request),
    });
  }

  @Post('verify-email')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body);
  }

  @Post('request-password-reset')
  async requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(body);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(this.extractAuthUser(request));
  }

  @UseGuards(JwtAuthGuard)
  @Post('update-account')
  async updateAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateAccountDto,
  ) {
    return this.authService.updateAccount(this.extractAuthUser(request), body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('delete-account')
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() body: DeleteAccountDto,
  ) {
    return this.authService.deleteAccount(this.extractAuthUser(request), body);
  }

  private extractAuthUser(request: AuthenticatedRequest): { userId: string } {
    if (!request.user?.sub) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    return {
      userId: request.user.sub,
    };
  }

  private extractIpAddress(request: AuthenticatedRequest): string {
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const rawValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = typeof rawValue === 'string' ? rawValue.split(',')[0]?.trim() : '';

    return forwardedIp || request.ip || 'unknown';
  }
}
