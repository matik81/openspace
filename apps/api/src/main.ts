import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

function parsePort(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${fieldName} must be an integer between 1 and 65535`);
  }

  return parsed;
}

export function resolveListenPort(
  runtimeEnv: NodeJS.ProcessEnv,
  configService: Pick<ConfigService, 'get'>,
): number {
  if (runtimeEnv.PORT !== undefined && runtimeEnv.PORT !== '') {
    return parsePort(runtimeEnv.PORT, 'PORT');
  }

  const apiPort = configService.get<number | string>('API_PORT');
  if (apiPort !== undefined && apiPort !== null && apiPort !== '') {
    return parsePort(apiPort, 'API_PORT');
  }

  return 3001;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.listen(resolveListenPort(process.env, configService));
}

if (require.main === module) {
  void bootstrap();
}
