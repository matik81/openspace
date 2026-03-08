import { ConfigService } from '@nestjs/config';
import { EmailProvider } from './email-provider.interface';

type EmailProviderName = 'console' | 'resend';

export function selectEmailProvider(
  configService: Pick<ConfigService, 'getOrThrow'>,
  providers: Record<EmailProviderName, () => EmailProvider>,
): EmailProvider {
  const providerName = configService.getOrThrow<EmailProviderName>('EMAIL_PROVIDER');
  return providers[providerName]();
}
