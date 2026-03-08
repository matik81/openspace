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

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(configService.getOrThrow<string>('RESEND_API_KEY'));
    this.fromEmail = configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.fromName = configService.get<string>('RESEND_FROM_NAME', 'OpenSpace');
  }

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    await this.sendEmail({
      to: payload.to,
      subject: 'Verify your OpenSpace email',
      text: [
        'Use this OpenSpace verification token to confirm your email address:',
        payload.token,
      ].join('\n\n'),
    });
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    await this.sendEmail({
      to: payload.to,
      subject: 'Reset your OpenSpace password',
      text: [
        'Use this OpenSpace password reset token to continue:',
        payload.token,
      ].join('\n\n'),
    });
  }

  private async sendEmail(payload: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.formatFromAddress(),
      to: payload.to,
      subject: payload.subject,
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
}
