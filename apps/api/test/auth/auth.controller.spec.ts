import { ConfigService } from '@nestjs/config';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';

function createController(trustedProxyIps: string[] = []) {
  const authService = {
    registerWithContext: jest.fn(),
    getRegistrationStatus: jest.fn(),
  } as unknown as AuthService;
  const configService = {
    get: jest.fn((key: string, fallback: unknown) =>
      key === 'TRUSTED_PROXY_IPS' ? trustedProxyIps : fallback,
    ),
  } as unknown as ConfigService;

  return {
    controller: new AuthController(authService, configService),
    authService,
  };
}

describe('AuthController', () => {
  it('uses x-forwarded-for when the request comes from a trusted proxy', async () => {
    const { controller, authService } = createController(['127.0.0.1']);

    await controller.register(
      {
        ip: '::ffff:127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
      },
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'strong-password',
      },
    );

    expect(authService.registerWithContext).toHaveBeenCalledWith(
      expect.any(Object),
      { ipAddress: '203.0.113.10' },
    );
  });

  it('ignores x-forwarded-for when the immediate peer is not trusted', async () => {
    const { controller, authService } = createController([]);

    await controller.register(
      {
        ip: '198.51.100.20',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      },
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'strong-password',
      },
    );

    expect(authService.registerWithContext).toHaveBeenCalledWith(
      expect.any(Object),
      { ipAddress: '198.51.100.20' },
    );
  });

  it('falls back to unknown when neither request.ip nor a trusted forwarded IP is valid', async () => {
    const { controller, authService } = createController(['127.0.0.1']);

    await controller.getRegistrationStatus({
      ip: undefined,
      headers: { 'x-forwarded-for': 'not-an-ip' },
    });

    expect(authService.getRegistrationStatus).toHaveBeenCalledWith({
      ipAddress: 'unknown',
    });
  });
});
