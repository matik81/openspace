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

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'OpenSpace <noreply@openspaceapp.io>',
        to: 'User+test@example.com',
        subject: 'Verify your OpenSpace email',
        text: expect.stringContaining(
          'https://openspaceapp.io/verify-email?token=verification-token&email=User%2Btest%40example.com',
        ),
        html: expect.stringContaining(
          'href="https://openspaceapp.io/verify-email?token=verification-token&amp;email=User%2Btest%40example.com"',
        ),
      }),
    );
  });

  it('sends a clickable password reset link pointing to the web app', async () => {
    const provider = new ResendEmailProvider(createConfigService());

    await provider.sendPasswordResetEmail({
      to: 'user@example.com',
      token: 'reset-token',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'OpenSpace <noreply@openspaceapp.io>',
        to: 'user@example.com',
        subject: 'Reset your OpenSpace password',
        text: expect.stringContaining(
          'https://openspaceapp.io/?auth=reset-password&token=reset-token&email=user%40example.com',
        ),
        html: expect.stringContaining(
          'href="https://openspaceapp.io/?auth=reset-password&amp;token=reset-token&amp;email=user%40example.com"',
        ),
      }),
    );
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
          'https://openspaceapp.io/app/verify-email?token=verification-token&email=user%40example.com',
        ),
      }),
    );
  });
});
