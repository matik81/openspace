import { ConfigService } from '@nestjs/config';
import { ResendEmailProvider } from '../../src/auth/email/resend-email.provider';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

function createConfigService(overrides: Partial<Record<string, string>> = {}): ConfigService {
  const values: Record<string, string> = {
    RESEND_API_KEY: 're_1234567890abcdef',
    RESEND_FROM_EMAIL: 'noreply@openspaceapp.io',
    RESEND_FROM_NAME: 'OpenSpace',
    WEB_BASE_URL: 'https://openspaceapp.io',
    ...overrides,
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

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ error: null });
  });

  it('sends a clickable verification link pointing to the web app', async () => {
    const provider = new ResendEmailProvider(createConfigService());

    await provider.sendVerificationEmail({
      to: 'User+test@example.com',
      token: 'verification-token',
    });

    const sentEmail = mockSend.mock.calls[0]?.[0];

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'OpenSpace <noreply@openspaceapp.io>',
        to: 'User+test@example.com',
        subject: 'Verify your OpenSpace email',
      }),
    );
    expect(sentEmail.text).toContain(
      'https://openspaceapp.io/verify-email?token=verification-token',
    );
    expect(sentEmail.text).toContain(
      'If needed, copy and paste the following token into the email verification form in OpenSpace:\n\nverification-token',
    );
    expect(sentEmail.html).toContain(
      'href="https://openspaceapp.io/verify-email?token=verification-token"',
    );
    expect(sentEmail.html).toContain(
      'If needed, copy and paste the following token into the email verification form in OpenSpace:',
    );
    expect(sentEmail.html).toContain('<code>verification-token</code>');
  });

  it('sends a clickable password reset link pointing to the web app', async () => {
    const provider = new ResendEmailProvider(createConfigService());

    await provider.sendPasswordResetEmail({
      to: 'user@example.com',
      token: 'reset-token',
    });

    const sentEmail = mockSend.mock.calls[0]?.[0];

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'OpenSpace <noreply@openspaceapp.io>',
        to: 'user@example.com',
        subject: 'Reset your OpenSpace password',
      }),
    );
    expect(sentEmail.text).toContain(
      'https://openspaceapp.io/?auth=reset-password&token=reset-token&email=user%40example.com',
    );
    expect(sentEmail.text).toContain(
      'If needed, copy and paste the following token into the password reset form in OpenSpace:\n\nreset-token',
    );
    expect(sentEmail.html).toContain(
      'href="https://openspaceapp.io/?auth=reset-password&amp;token=reset-token&amp;email=user%40example.com"',
    );
    expect(sentEmail.html).toContain(
      'If needed, copy and paste the following token into the password reset form in OpenSpace:',
    );
    expect(sentEmail.html).toContain('<code>reset-token</code>');
  });

  it('sends a clickable invitation registration link pointing to the register route', async () => {
    const provider = new ResendEmailProvider(createConfigService());

    await provider.sendWorkspaceInvitationEmail({
      to: 'invitee@example.com',
      invitationToken: 'invite-token',
      workspaceName: 'Engineering',
      inviterName: 'Ada Lovelace',
    });

    const sentEmail = mockSend.mock.calls[0]?.[0];

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'OpenSpace <noreply@openspaceapp.io>',
        to: 'invitee@example.com',
        subject: 'You were invited to Engineering on OpenSpace',
      }),
    );
    expect(sentEmail.text).toContain(
      'https://openspaceapp.io/register?token=invite-token',
    );
    expect(sentEmail.text).toContain(
      'Ada Lovelace invited you to join the workspace Engineering on OpenSpace.',
    );
    expect(sentEmail.html).toContain(
      'href="https://openspaceapp.io/register?token=invite-token"',
    );
    expect(sentEmail.html).toContain('<code>invite-token</code>');
  });

  it('preserves a configured path prefix in generated links', async () => {
    const provider = new ResendEmailProvider(
      createConfigService({ WEB_BASE_URL: 'https://openspaceapp.io/app/' }),
    );

    await provider.sendVerificationEmail({
      to: 'user@example.com',
      token: 'verification-token',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'https://openspaceapp.io/app/verify-email?token=verification-token',
        ),
      }),
    );
  });

  it('preserves a configured path prefix in invitation registration links', async () => {
    const provider = new ResendEmailProvider(
      createConfigService({ WEB_BASE_URL: 'https://openspaceapp.io/app/' }),
    );

    await provider.sendWorkspaceInvitationEmail({
      to: 'invitee@example.com',
      invitationToken: 'invite-token',
      workspaceName: 'Engineering',
      inviterName: 'Ada Lovelace',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'https://openspaceapp.io/app/register?token=invite-token',
        ),
      }),
    );
  });
});
