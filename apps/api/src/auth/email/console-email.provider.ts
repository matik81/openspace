import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProvider,
  PasswordResetEmailPayload,
  VerificationEmailPayload,
  WorkspaceInvitationEmailPayload,
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

  async sendWorkspaceInvitationEmail(payload: WorkspaceInvitationEmailPayload): Promise<void> {
    this.logger.log(
      `[DEV_WORKSPACE_INVITATION] to=${payload.to} workspace=${payload.workspaceName} inviter=${payload.inviterName} token=${payload.invitationToken}`,
    );
  }
}
