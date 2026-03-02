import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BACKEND_POLICY_DEFAULTS } from './backend-policy.defaults';

@Injectable()
export class BackendPolicyService {
  constructor(private readonly configService: ConfigService) {}

  get maxWorkspacesPerUser(): number {
    return this.configService.get<number>(
      'MAX_WORKSPACES_PER_USER',
      BACKEND_POLICY_DEFAULTS.MAX_WORKSPACES_PER_USER,
    );
  }

  get maxRoomsPerWorkspace(): number {
    return this.configService.get<number>(
      'MAX_ROOMS_PER_WORKSPACE',
      BACKEND_POLICY_DEFAULTS.MAX_ROOMS_PER_WORKSPACE,
    );
  }

  get maxUsersPerWorkspace(): number {
    return this.configService.get<number>(
      'MAX_USERS_PER_WORKSPACE',
      BACKEND_POLICY_DEFAULTS.MAX_USERS_PER_WORKSPACE,
    );
  }

  get maxPendingInvitationsPerWorkspace(): number {
    return this.configService.get<number>(
      'MAX_PENDING_INVITATIONS_PER_WORKSPACE',
      BACKEND_POLICY_DEFAULTS.MAX_PENDING_INVITATIONS_PER_WORKSPACE,
    );
  }

  get maxFutureBookingsPerUserPerWorkspace(): number {
    return this.configService.get<number>(
      'MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE',
      BACKEND_POLICY_DEFAULTS.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE,
    );
  }

  get maxBookingDaysAhead(): number {
    return this.configService.get<number>(
      'MAX_BOOKING_DAYS_AHEAD',
      BACKEND_POLICY_DEFAULTS.MAX_BOOKING_DAYS_AHEAD,
    );
  }

  get maxRegistrationsPerHourPerIp(): number {
    return this.configService.get<number>(
      'MAX_REGISTRATIONS_PER_HOUR_PER_IP',
      BACKEND_POLICY_DEFAULTS.MAX_REGISTRATIONS_PER_HOUR_PER_IP,
    );
  }

  get maxWorkspaceCreationsPerHourPerUser(): number {
    return this.configService.get<number>(
      'MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER',
      BACKEND_POLICY_DEFAULTS.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER,
    );
  }

  get maxRoomCreationsPerHourPerUser(): number {
    return this.configService.get<number>(
      'MAX_ROOM_CREATIONS_PER_HOUR_PER_USER',
      BACKEND_POLICY_DEFAULTS.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER,
    );
  }

  get maxInvitationCreationsPerHourPerUser(): number {
    return this.configService.get<number>(
      'MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER',
      BACKEND_POLICY_DEFAULTS.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER,
    );
  }

  get maxBookingCreationsPerHourPerUser(): number {
    return this.configService.get<number>(
      'MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER',
      BACKEND_POLICY_DEFAULTS.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER,
    );
  }

  get rateLimitSuspensionHours(): number {
    return this.configService.get<number>(
      'RATE_LIMIT_SUSPENSION_HOURS',
      BACKEND_POLICY_DEFAULTS.RATE_LIMIT_SUSPENSION_HOURS,
    );
  }
}
