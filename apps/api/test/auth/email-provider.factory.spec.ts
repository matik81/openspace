import { ConfigService } from '@nestjs/config';
import { selectEmailProvider } from '../../src/auth/email/email-provider.factory';
import { EmailProvider } from '../../src/auth/email/email-provider.interface';

function createConfigService(providerName: 'console' | 'resend'): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(providerName),
  } as unknown as ConfigService;
}

describe('selectEmailProvider', () => {
  it('returns the console provider when configured', () => {
    const consoleProvider = {} as EmailProvider;
    const resendProvider = {} as EmailProvider;

    const selected = selectEmailProvider(createConfigService('console'), {
      console: () => consoleProvider,
      resend: () => resendProvider,
    });

    expect(selected).toBe(consoleProvider);
  });

  it('returns the resend provider when configured', () => {
    const consoleProvider = {} as EmailProvider;
    const resendProvider = {} as EmailProvider;

    const selected = selectEmailProvider(createConfigService('resend'), {
      console: () => consoleProvider,
      resend: () => resendProvider,
    });

    expect(selected).toBe(resendProvider);
  });
});
