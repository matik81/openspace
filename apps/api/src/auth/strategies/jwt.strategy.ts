import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { OperationLimitsService } from '../../common/operation-limits.service';
import { JwtSubject } from '../types/jwt-subject.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly operationLimitsService: OperationLimitsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtSubject): Promise<JwtSubject> {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    await this.operationLimitsService.assertUserAuthenticationAllowed(payload.sub);

    return payload;
  }
}
