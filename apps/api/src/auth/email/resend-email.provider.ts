import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  EmailProvider,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from './email-provider.interface';

@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly webBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(configService.getOrThrow<string>('RESEND_API_KEY'));
    this.fromEmail = configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.fromName = configService.get<string>('RESEND_FROM_NAME', 'OpenSpace');
    this.webBaseUrl = this.normalizeBaseUrl(configService.getOrThrow<string>('WEB_BASE_URL'));
  }

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    const verificationUrl = this.buildVerificationUrl(payload);

    await this.sendEmail({
      to: payload.to,
      subject: 'Verify your OpenSpace email',
      html: [
        '<p>Confirm your OpenSpace email address by opening this link:</p>',
        `<p><a href="${this.escapeHtml(verificationUrl)}">${this.escapeHtml(verificationUrl)}</a></p>`,
        '<p>If needed, copy and paste the following token into the email verification form in OpenSpace:</p>',
        `<p><code>${this.escapeHtml(payload.token)}</code></p>`,
      ].join(''),
      text: [
        'Open this link to confirm your OpenSpace email address:',
        verificationUrl,
        'If needed, copy and paste the following token into the email verification form in OpenSpace:',
        payload.token,
      ].join('\n\n'),
    });
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    const passwordResetUrl = this.buildPasswordResetUrl(payload);

    await this.sendEmail({
      to: payload.to,
      subject: 'Reset your OpenSpace password',
      html: [
        '<p>Reset your OpenSpace password by opening this link:</p>',
        `<p><a href="${this.escapeHtml(passwordResetUrl)}">${this.escapeHtml(passwordResetUrl)}</a></p>`,
        '<p>If needed, copy and paste the following token into the password reset form in OpenSpace:</p>',
        `<p><code>${this.escapeHtml(payload.token)}</code></p>`,
      ].join(''),
      text: [
        'Open this link to reset your OpenSpace password:',
        passwordResetUrl,
        'If needed, copy and paste the following token into the password reset form in OpenSpace:',
        payload.token,
      ].join('\n\n'),
    });
  }

  private async sendEmail(payload: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.formatFromAddress(),
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    if (!error) {
      return;
    }

    this.logger.error(`Resend email delivery failed: ${error.message}`);

    throw new InternalServerErrorException({
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Email delivery failed',
    });
  }

  private formatFromAddress(): string {
    const normalizedName = this.fromName.trim();
    return normalizedName.length > 0
      ? `${normalizedName} <${this.fromEmail}>`
      : this.fromEmail;
  }

  private buildVerificationUrl(payload: VerificationEmailPayload): string {
    const url = new URL('verify-email', this.webBaseUrl);
    url.searchParams.set('token', payload.token);
    url.searchParams.set('email', payload.to);
    return url.toString();
  }

  private buildPasswordResetUrl(payload: PasswordResetEmailPayload): string {
    const url = new URL(this.webBaseUrl);
    url.searchParams.set('auth', 'reset-password');
    url.searchParams.set('token', payload.token);
    url.searchParams.set('email', payload.to);
    return url.toString();
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private normalizeBaseUrl(value: string): string {
    const url = new URL(value);
    if (!url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }

    return url.toString();
  }
}
