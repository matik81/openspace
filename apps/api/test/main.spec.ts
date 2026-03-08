import { ConfigService } from '@nestjs/config';
import { resolveListenPort } from '../src/main';

function createConfigService(apiPort?: number | string): ConfigService {
  return {
    get: jest.fn().mockReturnValue(apiPort),
  } as unknown as ConfigService;
}

describe('resolveListenPort', () => {
  it('prefers PORT from the runtime environment', () => {
    const port = resolveListenPort(
      { PORT: '8080' } as NodeJS.ProcessEnv,
      createConfigService(3001),
    );

    expect(port).toBe(8080);
  });

  it('falls back to API_PORT when PORT is not set', () => {
    const port = resolveListenPort({} as NodeJS.ProcessEnv, createConfigService(4100));

    expect(port).toBe(4100);
  });

  it('falls back to 3001 when neither PORT nor API_PORT is set', () => {
    const port = resolveListenPort({} as NodeJS.ProcessEnv, createConfigService(undefined));

    expect(port).toBe(3001);
  });

  it('throws when PORT is invalid', () => {
    expect(() =>
      resolveListenPort({ PORT: 'invalid' } as NodeJS.ProcessEnv, createConfigService(3001)),
    ).toThrow('PORT must be an integer between 1 and 65535');
  });
});
