import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProvider,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
} from './email-provider.interface';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async sendVerificationEmail(payload: VerificationEmailPayload): Promise<void> {
    this.logger.log(
      `[DEV_EMAIL_VERIFICATION] to=${payload.to} token=${payload.token}`,
    );
  }

  async sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<void> {
    this.logger.log(`[DEV_PASSWORD_RESET] to=${payload.to} token=${payload.token}`);
  }
}
