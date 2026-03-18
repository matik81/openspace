import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  RateLimitOperationType,
  RateLimitSubjectType,
} from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { BackendPolicyService } from './backend-policy.service';

@Injectable()
export class OperationLimitsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly backendPolicyService: BackendPolicyService,
  ) {}

  async assertRegistrationAllowed(ipAddress: string): Promise<void> {
    await this.assertIpNotSuspended(ipAddress);
    const count = await this.prismaService.operationLog.count({
      where: {
        operationType: RateLimitOperationType.REGISTER,
        ipAddress,
        createdAt: {
          gte: this.oneHourAgo(),
        },
      },
    });

    if (count >= this.backendPolicyService.maxRegistrationsPerHourPerIp) {
      const suspension = await this.suspendIp(ipAddress, RateLimitOperationType.REGISTER);
      this.throwSuspended(
        'IP_SUSPENDED',
        'Registration is suspended for this IP address',
        suspension.expiresAt,
      );
    }
  }

  async assertRegistrationStatusAllowed(ipAddress: string): Promise<void> {
    await this.assertIpNotSuspended(ipAddress);
  }

  async recordRegistration(ipAddress: string): Promise<void> {
    await this.prismaService.operationLog.create({
      data: {
        operationType: RateLimitOperationType.REGISTER,
        ipAddress,
      },
    });
  }

  async assertUserOperationAllowed(
    userId: string,
    operationType: RateLimitOperationType,
  ): Promise<void> {
    await this.assertUserNotSuspended(userId);
    const count = await this.prismaService.operationLog.count({
      where: {
        operationType,
        userId,
        createdAt: {
          gte: this.oneHourAgo(),
        },
      },
    });
    const limit = this.limitFor(operationType);

    if (count >= limit) {
      const suspension = await this.suspendUser(userId, operationType);
      this.throwSuspended(
        'USER_SUSPENDED',
        'User is suspended for 24 hours due to rate limits',
        suspension.expiresAt,
      );
    }
  }

  async assertUserAuthenticationAllowed(userId: string): Promise<void> {
    await this.assertUserNotSuspended(userId);
  }

  async recordUserOperation(
    userId: string,
    operationType: RateLimitOperationType,
  ): Promise<void> {
    await this.prismaService.operationLog.create({
      data: {
        operationType,
        userId,
      },
    });
  }

  private async assertIpNotSuspended(ipAddress: string): Promise<void> {
    const activeSuspension = await this.prismaService.rateLimitSuspension.findFirst({
      where: {
        subjectType: RateLimitSubjectType.IP,
        ipAddress,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        expiresAt: true,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (activeSuspension) {
      this.throwSuspended(
        'IP_SUSPENDED',
        'Registration is suspended for this IP address',
        activeSuspension.expiresAt,
      );
    }
  }

  private async assertUserNotSuspended(userId: string): Promise<void> {
    const activeSuspension = await this.prismaService.rateLimitSuspension.findFirst({
      where: {
        subjectType: RateLimitSubjectType.USER,
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        expiresAt: true,
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });

    if (activeSuspension) {
      this.throwSuspended(
        'USER_SUSPENDED',
        'User is suspended for 24 hours due to rate limits',
        activeSuspension.expiresAt,
      );
    }
  }

  private suspendUntil(): Date {
    return new Date(
      Date.now() + this.backendPolicyService.rateLimitSuspensionHours * 60 * 60 * 1000,
    );
  }

  private async suspendIp(ipAddress: string, operationType: RateLimitOperationType) {
    return this.prismaService.rateLimitSuspension.create({
      data: {
        subjectType: RateLimitSubjectType.IP,
        operationType,
        ipAddress,
        expiresAt: this.suspendUntil(),
      },
      select: {
        expiresAt: true,
      },
    });
  }

  private async suspendUser(userId: string, operationType: RateLimitOperationType) {
    const expiresAt = this.suspendUntil();

    return this.prismaService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });

      return tx.rateLimitSuspension.create({
        data: {
          subjectType: RateLimitSubjectType.USER,
          operationType,
          userId,
          expiresAt,
        },
        select: {
          expiresAt: true,
        },
      });
    });
  }

  private throwSuspended(code: string, message: string, expiresAt: Date): never {
    throw new HttpException({
      code,
      message: `${message} until ${expiresAt.toISOString()}`,
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      suspendedUntil: expiresAt.toISOString(),
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private oneHourAgo(): Date {
    return new Date(Date.now() - 60 * 60 * 1000);
  }

  private limitFor(operationType: RateLimitOperationType): number {
    switch (operationType) {
      case RateLimitOperationType.CREATE_WORKSPACE:
        return this.backendPolicyService.maxWorkspaceCreationsPerHourPerUser;
      case RateLimitOperationType.CREATE_ROOM:
        return this.backendPolicyService.maxRoomCreationsPerHourPerUser;
      case RateLimitOperationType.CREATE_INVITATION:
        return this.backendPolicyService.maxInvitationCreationsPerHourPerUser;
      case RateLimitOperationType.CREATE_BOOKING:
        return this.backendPolicyService.maxBookingCreationsPerHourPerUser;
      case RateLimitOperationType.REGISTER:
        return this.backendPolicyService.maxRegistrationsPerHourPerIp;
      default:
        return 1;
    }
  }
}

