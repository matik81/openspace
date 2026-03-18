import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConsoleEmailProvider } from './email/console-email.provider';
import { selectEmailProvider } from './email/email-provider.factory';
import { EMAIL_PROVIDER } from './email/email-provider.interface';
import { ResendEmailProvider } from './email/resend-email.provider';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        selectEmailProvider(configService, {
          console: () => new ConsoleEmailProvider(),
          resend: () => new ResendEmailProvider(configService),
        }),
    },
  ],
  exports: [AuthService, JwtModule, PassportModule, EMAIL_PROVIDER],
})
export class AuthModule {}
