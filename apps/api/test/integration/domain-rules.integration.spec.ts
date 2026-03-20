import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingCancellationReason,
  BookingCriticality,
  BookingStatus,
  MembershipStatus,
  RoomStatus,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '../../src/generated/prisma';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { EMAIL_PROVIDER, EmailProvider } from '../../src/auth/email/email-provider.interface';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Domain rules integration', () => {
  const envOverrides = {
    NODE_ENV: 'test',
    API_PORT: '3001',
    DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
    JWT_ACCESS_SECRET: '1234567890abcdef',
    JWT_REFRESH_SECRET: 'abcdef1234567890',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    EMAIL_VERIFICATION_TTL_MINUTES: '60',
    MAX_WORKSPACES_PER_USER: '2',
    MAX_ROOMS_PER_WORKSPACE: '2',
    MAX_USERS_PER_WORKSPACE: '2',
    MAX_PENDING_INVITATIONS_PER_WORKSPACE: '2',
    MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE: '2',
    MAX_BOOKING_DAYS_AHEAD: '365',
    MAX_REGISTRATIONS_PER_HOUR_PER_IP: '999',
    MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER: '999',
    MAX_ROOM_CREATIONS_PER_HOUR_PER_USER: '999',
    MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER: '999',
    MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER: '999',
  } as const;
  const previousEnvValues: Partial<Record<keyof typeof envOverrides, string | undefined>> = {};
  let app: INestApplication;
  let prismaService: PrismaService | null = null;
  let appModule: { AppModule: unknown };
  let jwtService: JwtService;
  const verificationTokensByEmail: Record<string, string> = {};
  const emailProviderMock: EmailProvider = {
    sendVerificationEmail: jest.fn(async ({ to, token }) => {
      verificationTokensByEmail[to.toLowerCase()] = token;
    }),
    sendPasswordResetEmail: jest.fn(async () => undefined),
    sendWorkspaceInvitationEmail: jest.fn(async () => undefined),
  };
  const password = 'strong-password';

  beforeAll(async () => {
    for (const [key, value] of Object.entries(envOverrides) as Array<
      [keyof typeof envOverrides, string]
    >) {
      previousEnvValues[key] = process.env[key];
      process.env[key] = value;
    }

    appModule = await import('../../src/app.module');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [appModule.AppModule as never],
    })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(emailProviderMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prismaService = app.get(PrismaService);
    jwtService = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await app.close();

    for (const [key, previousValue] of Object.entries(previousEnvValues) as Array<
      [keyof typeof envOverrides, string | undefined]
    >) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  });

  async function cleanDatabase(): Promise<void> {
    if (!prismaService) {
      return;
    }

    await prismaService.booking.deleteMany();
    await prismaService.room.deleteMany();
    await prismaService.invitation.deleteMany();
    await prismaService.workspaceMember.deleteMany();
    await prismaService.userWorkspacePreference.deleteMany();
    await prismaService.workspaceScheduleVersion.deleteMany();
    await prismaService.workspace.deleteMany();
    await prismaService.operationLog.deleteMany();
    await prismaService.rateLimitSuspension.deleteMany();
    await prismaService.emailVerificationToken.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  }

  async function createVerifiedUser(email: string) {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    return prismaService.user.create({
      data: {
        firstName: 'Test',
        lastName: 'User',
        email: email.toLowerCase(),
        passwordHash: hashSync(password, 12),
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });
  }

  async function registerAndVerify(email: string) {
    const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      firstName: 'Flow',
      lastName: 'User',
      email,
      password,
    });
    expect(registerResponse.status).toBe(201);

    const verificationToken = verificationTokensByEmail[email.toLowerCase()];
    expect(verificationToken).toEqual(expect.any(String));

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });
    expect(verifyResponse.status).toBe(201);
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({
      email,
      password,
    });
    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  async function accessTokenFor(userId: string, email: string): Promise<string> {
    return jwtService.signAsync(
      {
        sub: userId,
        email,
        emailVerifiedAt: new Date().toISOString(),
        tokenType: 'access',
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      },
    );
  }

  async function createWorkspace(token: string, name: string, timezone = 'UTC') {
    const response = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, timezone });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function createRoom(token: string, workspaceId: string, name: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function inviteMember(
    adminToken: string,
    workspaceId: string,
    email: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email });

    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  async function acceptInvitation(token: string, invitationId: string) {
    const response = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(201);
  }

  async function removeWorkspaceMember(
    adminToken: string,
    workspaceId: string,
    memberUserId: string,
    email: string,
  ) {
    return request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members/${memberUserId}/remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        password,
      });
  }

  async function addActiveWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = WorkspaceRole.MEMBER,
  ) {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    await prismaService.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      update: {
        role,
        status: MembershipStatus.ACTIVE,
      },
      create: {
        workspaceId,
        userId,
        role,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function updateWorkspaceMemberRole(
    token: string,
    workspaceId: string,
    memberUserId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    return request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/members/${memberUserId}/${role === 'ADMIN' ? 'promote' : 'demote'}`,
      )
      .set('Authorization', `Bearer ${token}`);
  }

  function futureDateIso(daysAhead: number, hour: number, minute = 0) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    date.setUTCHours(hour, minute, 0, 0);
    return date.toISOString();
  }

  function localUtcIso(date: Date, hour: number, minute = 0) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0),
    ).toISOString();
  }

  it('enforces the maximum number of workspaces per user across admin and participant memberships', async () => {
    await registerAndVerify('limit-owner@example.com');
    await registerAndVerify('workspace-admin-b@example.com');
    await registerAndVerify('workspace-admin-c@example.com');

    const ownerToken = await login('limit-owner@example.com');
    const adminBToken = await login('workspace-admin-b@example.com');
    const adminCToken = await login('workspace-admin-c@example.com');

    await createWorkspace(ownerToken, 'Workspace Limit A');
    const workspaceB = await createWorkspace(adminBToken, 'Workspace Limit B');
    const workspaceC = await createWorkspace(adminCToken, 'Workspace Limit C');

    const invitationB = await inviteMember(adminBToken, workspaceB, 'limit-owner@example.com');
    await acceptInvitation(ownerToken, invitationB);

    const invitationC = await inviteMember(adminCToken, workspaceC, 'limit-owner@example.com');
    const acceptCResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${invitationC}/accept`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(acceptCResponse.status).toBe(409);
    expect(acceptCResponse.body).toEqual({
      code: 'USER_WORKSPACE_LIMIT_REACHED',
      message: 'User has reached the maximum number of workspaces',
    });
  });

  it('allows duplicate workspace names but enforces unique active workspace slugs', async () => {
    const admin = await createVerifiedUser('workspace-name-admin@example.com');
    const secondAdmin = await createVerifiedUser('workspace-name-admin-2@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const secondAdminToken = await accessTokenFor(secondAdmin.id, secondAdmin.email);

    const workspaceId = await createWorkspace(adminToken, 'Unique Workspace');
    const duplicateNameResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({ name: 'Unique Workspace', slug: 'unique.workspace.alt', timezone: 'UTC' });

    expect(duplicateNameResponse.status).toBe(201);
    expect(duplicateNameResponse.body.name).toBe('Unique Workspace');

    const duplicateResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({ name: 'Another Workspace', slug: 'unique-workspace', timezone: 'UTC' });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({
      code: 'WORKSPACE_SLUG_ALREADY_EXISTS',
      message: 'A workspace with this web address already exists',
    });

    const cancelResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workspaceName: 'Unique Workspace',
        email: admin.email,
        password,
      });

    expect(cancelResponse.status).toBe(201);
    expect(cancelResponse.body).toEqual({ cancelled: true });

    const recreateResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({ name: 'Unique Workspace', timezone: 'UTC' });

    expect(recreateResponse.status).toBe(201);
    expect(recreateResponse.body.name).toBe('Unique Workspace');
  });

  it('enforces unique room names per workspace only across active rooms and the maximum room count', async () => {
    const admin = await createVerifiedUser('room-admin@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(adminToken, 'Room Capacity Workspace');
    const roomAId = await createRoom(adminToken, workspaceId, 'Room A');

    const duplicateResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Room A' });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({
      code: 'ROOM_NAME_ALREADY_EXISTS',
      message: 'A room with this name already exists in the workspace',
    });

    const cancelRoomResponse = await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/rooms/${roomAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomName: 'Room A',
        email: admin.email,
        password,
      });

    expect(cancelRoomResponse.status).toBe(200);
    expect(cancelRoomResponse.body).toEqual({
      cancelled: true,
      cancelledBookingsCount: 0,
    });

    await createRoom(adminToken, workspaceId, 'Room A');
    await createRoom(adminToken, workspaceId, 'Room B');

    const overflowResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Room C' });

    expect(overflowResponse.status).toBe(409);
    expect(overflowResponse.body).toEqual({
      code: 'WORKSPACE_ROOM_LIMIT_REACHED',
      message: 'Workspace has reached the maximum number of rooms',
    });
  });

  it('enforces the maximum number of pending invitations per workspace and supports reinviting after rejection', async () => {
    await registerAndVerify('capacity-admin@example.com');
    await registerAndVerify('pending-1@example.com');
    await registerAndVerify('pending-2@example.com');
    await registerAndVerify('pending-3@example.com');

    const adminToken = await login('capacity-admin@example.com');
    const pending1Token = await login('pending-1@example.com');
    const workspaceId = await createWorkspace(adminToken, 'Invitation Capacity Workspace');

    const pending1Invitation = await inviteMember(adminToken, workspaceId, 'pending-1@example.com');
    await inviteMember(adminToken, workspaceId, 'pending-2@example.com');

    const pendingOverflowResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'pending-3@example.com' });

    expect(pendingOverflowResponse.status).toBe(409);
    expect(pendingOverflowResponse.body).toEqual({
      code: 'WORKSPACE_PENDING_INVITATION_LIMIT_REACHED',
      message: 'Workspace has reached the maximum number of pending invitations',
    });

    const rejectResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${pending1Invitation}/reject`)
      .set('Authorization', `Bearer ${pending1Token}`);
    expect(rejectResponse.status).toBe(201);
    expect(rejectResponse.body).toEqual({ rejected: true });

    const reinviteResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'pending-1@example.com' });

    expect(reinviteResponse.status).toBe(201);
    expect(reinviteResponse.body.status).toBe('PENDING');
  });

  it('enforces the maximum number of active users per workspace', async () => {
    const admin = await createVerifiedUser('users-cap-admin@example.com');
    const memberOne = await createVerifiedUser('member-one@example.com');
    const memberTwo = await createVerifiedUser('member-two@example.com');

    const adminToken = await accessTokenFor(admin.id, admin.email);
    const memberOneToken = await accessTokenFor(memberOne.id, memberOne.email);
    const memberTwoToken = await accessTokenFor(memberTwo.id, memberTwo.email);
    const workspaceId = await createWorkspace(adminToken, 'User Capacity Workspace');

    const memberOneInvitation = await inviteMember(
      adminToken,
      workspaceId,
      'member-one@example.com',
    );
    await acceptInvitation(memberOneToken, memberOneInvitation);

    const secondMemberInvitation = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'member-two@example.com' });
    expect(secondMemberInvitation.status).toBe(201);

    const acceptOverflowResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${secondMemberInvitation.body.id as string}/accept`)
      .set('Authorization', `Bearer ${memberTwoToken}`);

    expect(acceptOverflowResponse.status).toBe(409);
    expect(acceptOverflowResponse.body).toEqual({
      code: 'WORKSPACE_USER_LIMIT_REACHED',
      message: 'Workspace has reached the maximum number of users',
    });
  });

  it('enforces the future booking count limit per user per workspace and the 365-day booking horizon', async () => {
    const admin = await createVerifiedUser('booking-cap-admin@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(adminToken, 'Booking Capacity Workspace');
    const roomId = await createRoom(adminToken, workspaceId, 'Focus Room');

    const tooFarResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: futureDateIso(366, 10),
        endAt: futureDateIso(366, 11),
        subject: 'Too far ahead',
      });

    expect(tooFarResponse.status).toBe(400);
    expect(tooFarResponse.body).toEqual({
      code: 'BOOKING_TOO_FAR_IN_FUTURE',
      message: 'Booking date cannot be more than 365 days in the future',
    });

    for (const [dayOffset, hour] of [
      [10, 9],
      [11, 10],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/bookings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId,
          startAt: futureDateIso(dayOffset, hour),
          endAt: futureDateIso(dayOffset, hour + 1),
          subject: `Booking ${dayOffset}`,
          criticality: BookingCriticality.MEDIUM,
        });

      expect(response.status).toBe(201);
    }

    const overflowResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: futureDateIso(12, 11),
        endAt: futureDateIso(12, 12),
        subject: 'Overflow booking',
      });

    expect(overflowResponse.status).toBe(409);
    expect(overflowResponse.body).toEqual({
      code: 'USER_FUTURE_BOOKING_LIMIT_REACHED',
      message: 'User has reached the maximum number of future bookings in this workspace',
    });
  });

  it('cancels future bookings when a member leaves, keeps past bookings, and supports reinvite plus rejoin', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const yesterdayUtc = new Date(todayUtc);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);

    const admin = await createVerifiedUser('leave-admin@example.com');
    const member = await createVerifiedUser('leave-member@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const memberToken = await accessTokenFor(member.id, member.email);
    const workspaceId = await createWorkspace(adminToken, 'Leave Workspace Rules');
    const roomId = await createRoom(adminToken, workspaceId, 'History Room');
    const invitationId = await inviteMember(adminToken, workspaceId, 'leave-member@example.com');
    await acceptInvitation(memberToken, invitationId);

    const futureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        roomId,
        startAt: futureDateIso(20, 10),
        endAt: futureDateIso(20, 11),
        subject: 'Future booking before leave',
      });
    expect(futureBookingResponse.status).toBe(201);
    const futureBookingId = futureBookingResponse.body.id as string;

    const pastBooking = await prismaService.booking.create({
      data: {
        workspaceId,
        roomId,
        createdByUserId: member.id,
        startAt: new Date(localUtcIso(yesterdayUtc, 10)),
        endAt: new Date(localUtcIso(yesterdayUtc, 11)),
        subject: 'Past booking before leave',
      },
      select: { id: true },
    });

    const leaveResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        email: 'leave-member@example.com',
        password,
      });
    expect(leaveResponse.status).toBe(201);
    expect(leaveResponse.body).toEqual({ left: true });

    const membership = await prismaService.workspaceMember.findFirst({
      where: { workspaceId, userId: member.id },
      select: { status: true },
    });
    const [futureBooking, persistedPastBooking] = await Promise.all([
      prismaService.booking.findUnique({
        where: { id: futureBookingId },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
      prismaService.booking.findUnique({
        where: { id: pastBooking.id },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
    ]);

    expect(membership).toEqual({ status: MembershipStatus.INACTIVE });
    expect(futureBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
      cancelledAt: expect.any(Date),
    });
    expect(persistedPastBooking).toEqual({
      status: BookingStatus.ACTIVE,
      cancellationReason: null,
      cancelledAt: null,
    });

    const [activeMembersResponse, adminSummaryResponse] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/admin-summary`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect(activeMembersResponse.status).toBe(200);
    expect(activeMembersResponse.body.items).toEqual([
      expect.objectContaining({
        email: 'leave-admin@example.com',
        status: MembershipStatus.ACTIVE,
      }),
    ]);

    expect(adminSummaryResponse.status).toBe(200);
    expect(adminSummaryResponse.body.members.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'leave-admin@example.com',
          status: MembershipStatus.ACTIVE,
        }),
        expect.objectContaining({
          email: 'leave-member@example.com',
          status: MembershipStatus.INACTIVE,
        }),
      ]),
    );

    const reinvitation = await inviteMember(adminToken, workspaceId, 'leave-member@example.com');
    await acceptInvitation(memberToken, reinvitation);

    const listResponse = await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/bookings?mine=true&includePast=true&includeCancelled=true`,
      )
      .set('Authorization', `Bearer ${memberToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pastBooking.id,
          status: BookingStatus.ACTIVE,
        }),
        expect.objectContaining({
          id: futureBookingId,
          status: BookingStatus.CANCELLED,
        }),
      ]),
    );
  });

  it('allows admins to leave the workspace but blocks the owner from leaving', async () => {
    const owner = await createVerifiedUser('leave-owner@example.com');
    const admin = await createVerifiedUser('leave-admin-promoted@example.com');
    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(ownerToken, 'Admin Leave Workspace');

    const invitationId = await inviteMember(ownerToken, workspaceId, admin.email);
    await acceptInvitation(adminToken, invitationId);

    const promoteResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      admin.id,
      'ADMIN',
    );
    expect(promoteResponse.status).toBe(200);

    const adminLeaveResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: admin.email,
        password,
      });

    expect(adminLeaveResponse.status).toBe(201);
    expect(adminLeaveResponse.body).toEqual({ left: true });

    const adminMembership = await prismaService!.workspaceMember.findFirst({
      where: { workspaceId, userId: admin.id },
      select: { status: true },
    });
    expect(adminMembership).toEqual({ status: MembershipStatus.INACTIVE });

    const ownerLeaveResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: owner.email,
        password,
      });

    expect(ownerLeaveResponse.status).toBe(403);
    expect(ownerLeaveResponse.body).toEqual({
      code: 'OWNER_CANNOT_LEAVE_WORKSPACE',
      message: 'Workspace owner cannot leave the workspace',
    });
  });

  it('lets the owner promote or demote admins and blocks non-owner admins from changing roles', async () => {
    const owner = await createVerifiedUser('role-owner@example.com');
    const adminCandidate = await createVerifiedUser('role-admin@example.com');
    const memberCandidate = await createVerifiedUser('role-member@example.com');
    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const adminToken = await accessTokenFor(adminCandidate.id, adminCandidate.email);
    const workspaceId = await createWorkspace(ownerToken, 'Workspace Role Rules');

    await addActiveWorkspaceMember(workspaceId, adminCandidate.id);
    await addActiveWorkspaceMember(workspaceId, memberCandidate.id);

    const promoteResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminCandidate.id,
      'ADMIN',
    );
    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body).toEqual({
      userId: adminCandidate.id,
      role: 'ADMIN',
      status: MembershipStatus.ACTIVE,
    });

    const demoteResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminCandidate.id,
      'MEMBER',
    );
    expect(demoteResponse.status).toBe(200);
    expect(demoteResponse.body).toEqual({
      userId: adminCandidate.id,
      role: 'MEMBER',
      status: MembershipStatus.ACTIVE,
    });

    const rePromoteResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminCandidate.id,
      'ADMIN',
    );
    expect(rePromoteResponse.status).toBe(200);

    const nonOwnerPromoteResponse = await updateWorkspaceMemberRole(
      adminToken,
      workspaceId,
      memberCandidate.id,
      'ADMIN',
    );
    expect(nonOwnerPromoteResponse.status).toBe(403);
    expect(nonOwnerPromoteResponse.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });

    const nonOwnerDemoteResponse = await updateWorkspaceMemberRole(
      adminToken,
      workspaceId,
      adminCandidate.id,
      'MEMBER',
    );
    expect(nonOwnerDemoteResponse.status).toBe(403);
    expect(nonOwnerDemoteResponse.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });
  });

  it('allows a non-owner admin to remove an active member, cancels future bookings, and removes workspace visibility', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const yesterdayUtc = new Date(todayUtc);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);

    const owner = await createVerifiedUser('remove-owner@example.com');
    const admin = await createVerifiedUser('remove-admin@example.com');
    const member = await createVerifiedUser('remove-member@example.com');
    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const memberToken = await accessTokenFor(member.id, member.email);
    const workspaceId = await createWorkspace(ownerToken, 'Remove Workspace Member');
    await addActiveWorkspaceMember(workspaceId, admin.id);
    await addActiveWorkspaceMember(workspaceId, member.id);

    const promoteResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      admin.id,
      'ADMIN',
    );
    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body).toEqual({
      userId: admin.id,
      role: 'ADMIN',
      status: MembershipStatus.ACTIVE,
    });

    const roomId = await createRoom(adminToken, workspaceId, 'Removal Room');

    const futureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        roomId,
        startAt: futureDateIso(20, 10),
        endAt: futureDateIso(20, 11),
        subject: 'Future booking before removal',
      });
    expect(futureBookingResponse.status).toBe(201);
    const futureBookingId = futureBookingResponse.body.id as string;

    const pastBooking = await prismaService.booking.create({
      data: {
        workspaceId,
        roomId,
        createdByUserId: member.id,
        startAt: new Date(localUtcIso(yesterdayUtc, 10)),
        endAt: new Date(localUtcIso(yesterdayUtc, 11)),
        subject: 'Past booking before removal',
      },
      select: { id: true },
    });

    const removeResponse = await removeWorkspaceMember(
      adminToken,
      workspaceId,
      member.id,
      admin.email,
    );

    expect(removeResponse.status).toBe(201);
    expect(removeResponse.body).toEqual({
      removed: true,
      cancelledBookingsCount: 1,
    });

    const [membership, futureBooking, persistedPastBooking, visibleWorkspaceResponse] =
      await Promise.all([
        prismaService.workspaceMember.findFirst({
          where: { workspaceId, userId: member.id },
          select: { status: true },
        }),
        prismaService.booking.findUnique({
          where: { id: futureBookingId },
          select: { status: true, cancellationReason: true, cancelledAt: true },
        }),
        prismaService.booking.findUnique({
          where: { id: pastBooking.id },
          select: { status: true, cancellationReason: true, cancelledAt: true },
        }),
        request(app.getHttpServer())
          .get(`/api/workspaces/${workspaceId}`)
          .set('Authorization', `Bearer ${memberToken}`),
      ]);

    expect(membership).toEqual({ status: MembershipStatus.INACTIVE });
    expect(futureBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
      cancelledAt: expect.any(Date),
    });
    expect(persistedPastBooking).toEqual({
      status: BookingStatus.ACTIVE,
      cancellationReason: null,
      cancelledAt: null,
    });

    expect(visibleWorkspaceResponse.status).toBe(403);
    expect(visibleWorkspaceResponse.body).toEqual({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });

    const [activeMembersResponse, adminSummaryResponse] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/admin-summary`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect(activeMembersResponse.status).toBe(200);
    expect(activeMembersResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: owner.email,
          status: MembershipStatus.ACTIVE,
        }),
        expect.objectContaining({
          email: admin.email,
          status: MembershipStatus.ACTIVE,
        }),
      ]),
    );

    expect(adminSummaryResponse.status).toBe(200);
    expect(adminSummaryResponse.body.members.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: owner.email,
          status: MembershipStatus.ACTIVE,
        }),
        expect.objectContaining({
          email: admin.email,
          status: MembershipStatus.ACTIVE,
        }),
        expect.objectContaining({
          email: member.email,
          status: MembershipStatus.INACTIVE,
        }),
      ]),
    );
  });

  it('prevents removing a workspace admin through the member removal flow', async () => {
    const admin = await createVerifiedUser('remove-admin-blocked@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(adminToken, 'Admin Removal Blocked');

    const removeResponse = await removeWorkspaceMember(
      adminToken,
      workspaceId,
      admin.id,
      admin.email,
    );

    expect(removeResponse.status).toBe(403);
    expect(removeResponse.body).toEqual({
      code: 'ADMIN_CANNOT_BE_REMOVED',
      message: 'Workspace admins cannot be removed',
    });
  });

  it('enforces derived owner permissions across settings, role changes, resources, invitations, removal, and leave flows', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const owner = await createVerifiedUser('owner-permissions@example.com');
    const adminA = await createVerifiedUser('owner-admin-a@example.com');
    const adminB = await createVerifiedUser('owner-admin-b@example.com');
    const member = await createVerifiedUser('owner-member@example.com');
    const removable = await createVerifiedUser('owner-removable@example.com');
    const invitee = await createVerifiedUser('owner-invitee@example.com');

    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const adminAToken = await accessTokenFor(adminA.id, adminA.email);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Owner Permissions Workspace',
        timezone: 'Europe/Rome',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    await Promise.all([
      addActiveWorkspaceMember(workspaceId, adminA.id),
      addActiveWorkspaceMember(workspaceId, adminB.id),
      addActiveWorkspaceMember(workspaceId, member.id),
      addActiveWorkspaceMember(workspaceId, removable.id),
    ]);

    const visibleWorkspaceResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(visibleWorkspaceResponse.status).toBe(200);
    expect(visibleWorkspaceResponse.body.createdByUserId).toBe(owner.id);

    const promoteAdminAResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminA.id,
      'ADMIN',
    );
    expect(promoteAdminAResponse.status).toBe(200);
    expect(promoteAdminAResponse.body).toMatchObject({
      userId: adminA.id,
      role: 'ADMIN',
      status: MembershipStatus.ACTIVE,
    });

    const promoteAdminBResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminB.id,
      'ADMIN',
    );
    expect(promoteAdminBResponse.status).toBe(200);
    expect(promoteAdminBResponse.body).toMatchObject({
      userId: adminB.id,
      role: 'ADMIN',
      status: MembershipStatus.ACTIVE,
    });

    const nonOwnerPromoteAttempt = await updateWorkspaceMemberRole(
      adminAToken,
      workspaceId,
      member.id,
      'ADMIN',
    );
    expect(nonOwnerPromoteAttempt.status).toBe(403);
    expect(nonOwnerPromoteAttempt.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });

    const nonOwnerDemoteAttempt = await updateWorkspaceMemberRole(
      adminAToken,
      workspaceId,
      adminB.id,
      'MEMBER',
    );
    expect(nonOwnerDemoteAttempt.status).toBe(403);
    expect(nonOwnerDemoteAttempt.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });

    const adminUpdateAttempt = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ name: 'Unauthorized rename attempt' });
    expect(adminUpdateAttempt.status).toBe(403);
    expect(adminUpdateAttempt.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });

    const ownerUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Owner Workspace Renamed',
        timezone: 'Europe/Paris',
      });
    expect(ownerUpdateResponse.status).toBe(200);
    expect(ownerUpdateResponse.body).toMatchObject({
      id: workspaceId,
      name: 'Owner Workspace Renamed',
      timezone: 'Europe/Paris',
      createdByUserId: owner.id,
    });

    const adminCancelAttempt = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        workspaceName: 'Owner Workspace Renamed',
        email: adminA.email,
        password,
      });
    expect(adminCancelAttempt.status).toBe(403);
    expect(adminCancelAttempt.body).toEqual({
      code: 'ONLY_WORKSPACE_OWNER',
      message: 'Only the workspace owner can perform this action',
    });

    const roomId = await createRoom(adminAToken, workspaceId, 'Owner Admin Room');

    const updateRoomResponse = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        name: 'Owner Admin Room Updated',
        description: 'Updated by delegated admin',
      });
    expect(updateRoomResponse.status).toBe(200);
    expect(updateRoomResponse.body).toMatchObject({
      id: roomId,
      name: 'Owner Admin Room Updated',
      description: 'Updated by delegated admin',
    });

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: invitee.email,
      });
    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body).toMatchObject({
      email: invitee.email,
      status: 'PENDING',
    });

    const removeResponse = await removeWorkspaceMember(
      adminAToken,
      workspaceId,
      removable.id,
      adminA.email,
    );
    expect(removeResponse.status).toBe(201);
    expect(removeResponse.body).toEqual({
      removed: true,
      cancelledBookingsCount: 0,
    });

    const promoteMemberResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      member.id,
      'ADMIN',
    );
    expect(promoteMemberResponse.status).toBe(200);
    expect(promoteMemberResponse.body).toMatchObject({
      userId: member.id,
      role: 'ADMIN',
      status: MembershipStatus.ACTIVE,
    });

    const demoteAdminResponse = await updateWorkspaceMemberRole(
      ownerToken,
      workspaceId,
      adminB.id,
      'MEMBER',
    );
    expect(demoteAdminResponse.status).toBe(200);
    expect(demoteAdminResponse.body).toMatchObject({
      userId: adminB.id,
      role: 'MEMBER',
      status: MembershipStatus.ACTIVE,
    });

    const deleteRoomResponse = await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        roomName: 'Owner Admin Room Updated',
        email: adminA.email,
        password,
      });
    expect(deleteRoomResponse.status).toBe(200);
    expect(deleteRoomResponse.body).toEqual({
      cancelled: true,
      cancelledBookingsCount: 0,
    });

    const ownerLeaveAttempt = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: owner.email,
        password,
      });
    expect(ownerLeaveAttempt.status).toBe(403);
    expect(ownerLeaveAttempt.body).toEqual({
      code: 'OWNER_CANNOT_LEAVE_WORKSPACE',
      message: 'Workspace owner cannot leave the workspace',
    });

    const adminLeaveResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/leave`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        email: adminA.email,
        password,
      });
    expect(adminLeaveResponse.status).toBe(201);
    expect(adminLeaveResponse.body).toEqual({ left: true });

    const adminMembership = await prismaService.workspaceMember.findFirst({
      where: { workspaceId, userId: adminA.id },
      select: { status: true, role: true },
    });
    expect(adminMembership).toEqual({
      status: MembershipStatus.INACTIVE,
      role: 'ADMIN',
    });

    const ownerCancelResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        workspaceName: 'Owner Workspace Renamed',
        email: owner.email,
        password,
      });
    expect(ownerCancelResponse.status).toBe(201);
    expect(ownerCancelResponse.body).toEqual({ cancelled: true });

    const cancelledWorkspace = await prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { status: true, cancelledAt: true },
    });
    expect(cancelledWorkspace).toEqual({
      status: WorkspaceStatus.CANCELLED,
      cancelledAt: expect.any(Date),
    });
  });

  it('cancels only owned workspaces when deleting an account and leaves non-owned admin workspaces active', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const owner = await createVerifiedUser('delete-owner@example.com');
    const memberWorkspaceAdmin = await createVerifiedUser('delete-member-admin@example.com');
    const adminWorkspaceOwner = await createVerifiedUser('delete-admin-owner@example.com');

    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const memberWorkspaceAdminToken = await accessTokenFor(
      memberWorkspaceAdmin.id,
      memberWorkspaceAdmin.email,
    );
    const adminWorkspaceOwnerToken = await accessTokenFor(
      adminWorkspaceOwner.id,
      adminWorkspaceOwner.email,
    );
    const ownedWorkspaceId = await createWorkspace(ownerToken, 'Owned Workspace');

    const memberWorkspaceId = await createWorkspace(
      memberWorkspaceAdminToken,
      'Participant Workspace',
    );
    const memberRoomId = await createRoom(
      memberWorkspaceAdminToken,
      memberWorkspaceId,
      'Participant Room',
    );
    const memberInvitation = await inviteMember(
      memberWorkspaceAdminToken,
      memberWorkspaceId,
      'delete-owner@example.com',
    );
    await acceptInvitation(ownerToken, memberInvitation);

    const memberBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${memberWorkspaceId}/bookings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        roomId: memberRoomId,
        startAt: futureDateIso(21, 9),
        endAt: futureDateIso(21, 10),
        subject: 'Booking before account deletion',
      });
    expect(memberBookingResponse.status).toBe(201);

    const adminWorkspaceId = await createWorkspace(
      adminWorkspaceOwnerToken,
      'Delegated Admin Workspace',
    );
    const adminWorkspaceRoomId = await createRoom(
      adminWorkspaceOwnerToken,
      adminWorkspaceId,
      'Delegated Admin Room',
    );
    await addActiveWorkspaceMember(adminWorkspaceId, owner.id, WorkspaceRole.ADMIN);

    const adminBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${adminWorkspaceId}/bookings`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        roomId: adminWorkspaceRoomId,
        startAt: futureDateIso(22, 11),
        endAt: futureDateIso(22, 12),
        subject: 'Admin booking before account deletion',
      });
    expect(adminBookingResponse.status).toBe(201);

    const deleteResponse = await request(app.getHttpServer())
      .post('/api/auth/delete-account')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'delete-owner@example.com',
        password,
      });

    expect(deleteResponse.status).toBe(201);
    expect(deleteResponse.body).toEqual({ cancelled: true });

    const [user, memberMembership, adminMembership, memberBooking, adminBooking, ownedWorkspace, delegatedAdminWorkspace] =
      await Promise.all([
      prismaService.user.findUnique({
        where: { email: 'delete-owner@example.com' },
        select: { status: true, cancelledAt: true },
      }),
      prismaService.workspaceMember.findFirst({
        where: { workspaceId: memberWorkspaceId, userId: owner.id },
        select: { status: true },
      }),
      prismaService.workspaceMember.findFirst({
        where: { workspaceId: adminWorkspaceId, userId: owner.id },
        select: { status: true, role: true },
      }),
      prismaService.booking.findUnique({
        where: { id: memberBookingResponse.body.id as string },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
      prismaService.booking.findUnique({
        where: { id: adminBookingResponse.body.id as string },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
      prismaService.workspace.findUnique({
        where: { id: ownedWorkspaceId },
        select: { status: true, cancelledAt: true },
      }),
      prismaService.workspace.findUnique({
        where: { id: adminWorkspaceId },
        select: { status: true, cancelledAt: true },
      }),
    ]);

    expect(user).toEqual({
      status: UserStatus.CANCELLED,
      cancelledAt: expect.any(Date),
    });
    expect(memberMembership).toEqual({ status: MembershipStatus.INACTIVE });
    expect(adminMembership).toEqual({
      status: MembershipStatus.INACTIVE,
      role: 'ADMIN',
    });
    expect(memberBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
      cancelledAt: expect.any(Date),
    });
    expect(adminBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
      cancelledAt: expect.any(Date),
    });
    expect(ownedWorkspace).toEqual({
      status: WorkspaceStatus.CANCELLED,
      cancelledAt: expect.any(Date),
    });
    expect(delegatedAdminWorkspace).toEqual({
      status: WorkspaceStatus.ACTIVE,
      cancelledAt: null,
    });
  });

  it('reactivates a cancelled account when the same email registers again', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    await registerAndVerify('reactivation-domain@example.com');
    const firstLoginToken = await login('reactivation-domain@example.com');

    const deleteResponse = await request(app.getHttpServer())
      .post('/api/auth/delete-account')
      .set('Authorization', `Bearer ${firstLoginToken}`)
      .send({
        email: 'reactivation-domain@example.com',
        password,
      });
    expect(deleteResponse.status).toBe(201);

    const oldUser = await prismaService.user.findUnique({
      where: { email: 'reactivation-domain@example.com' },
      select: { id: true, status: true },
    });
    expect(oldUser).toEqual({
      id: expect.any(String),
      status: UserStatus.CANCELLED,
    });

    const reRegisterResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      firstName: 'Reactivated',
      lastName: 'User',
      email: 'reactivation-domain@example.com',
      password: 're-strong-password',
    });
    expect(reRegisterResponse.status).toBe(201);

    const reactivatedUser = await prismaService.user.findUnique({
      where: { email: 'reactivation-domain@example.com' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        cancelledAt: true,
        emailVerifiedAt: true,
      },
    });
    expect(reactivatedUser).toEqual({
      id: oldUser!.id,
      firstName: 'Reactivated',
      lastName: 'User',
      status: UserStatus.ACTIVE,
      cancelledAt: null,
      emailVerifiedAt: null,
    });

    const preVerifyLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'reactivation-domain@example.com',
      password: 're-strong-password',
    });
    expect(preVerifyLogin.status).toBe(403);
    expect(preVerifyLogin.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('soft-cancels rooms and future bookings while preserving past booking history', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const yesterdayUtc = new Date(todayUtc);
    yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);

    const admin = await createVerifiedUser('delete-room-admin@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(adminToken, 'Room Deletion Workspace');
    const roomId = await createRoom(adminToken, workspaceId, 'Disposable Room');

    const futureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: futureDateIso(22, 14),
        endAt: futureDateIso(22, 15),
        subject: 'Future booking in room',
      });
    expect(futureBookingResponse.status).toBe(201);

    const pastBooking = await prismaService.booking.create({
      data: {
        workspaceId,
        roomId,
        createdByUserId: admin.id,
        startAt: new Date(localUtcIso(yesterdayUtc, 13)),
        endAt: new Date(localUtcIso(yesterdayUtc, 14)),
        subject: 'Past booking in room',
      },
      select: { id: true },
    });

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomName: 'Disposable Room',
        email: 'delete-room-admin@example.com',
        password,
      });

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ cancelled: true, cancelledBookingsCount: 1 });

    const [room, futureBooking, persistedPastBooking] = await Promise.all([
      prismaService.room.findUnique({
        where: { id: roomId },
        select: { status: true, cancelledAt: true },
      }),
      prismaService.booking.findUnique({
        where: { id: futureBookingResponse.body.id as string },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
      prismaService.booking.findUnique({
        where: { id: pastBooking.id },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
    ]);

    expect(room).toEqual({
      status: RoomStatus.CANCELLED,
      cancelledAt: expect.any(Date),
    });
    expect(futureBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.ROOM_UNAVAILABLE,
      cancelledAt: expect.any(Date),
    });
    expect(persistedPastBooking).toEqual({
      status: BookingStatus.ACTIVE,
      cancellationReason: null,
      cancelledAt: null,
    });
  });

  it('stores schedule history and cancels only future bookings that become incompatible after a workspace schedule change', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const admin = await createVerifiedUser('schedule-admin@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const workspaceId = await createWorkspace(adminToken, 'Schedule History Workspace');
    const roomId = await createRoom(adminToken, workspaceId, 'Schedule Room');

    const compatibleResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: futureDateIso(24, 9),
        endAt: futureDateIso(24, 10),
        subject: 'Still compatible',
      });
    expect(compatibleResponse.status).toBe(201);

    const incompatibleResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: futureDateIso(24, 17),
        endAt: futureDateIso(24, 18),
        subject: 'Will become incompatible',
      });
    expect(incompatibleResponse.status).toBe(201);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        timezone: 'UTC',
        scheduleStartHour: 9,
        scheduleEndHour: 17,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      scheduleStartHour: 9,
      scheduleEndHour: 17,
    });

    const [scheduleVersions, compatibleBooking, incompatibleBooking] = await Promise.all([
      prismaService.workspaceScheduleVersion.findMany({
        where: { workspaceId },
        orderBy: { effectiveFrom: 'asc' },
        select: {
          timezone: true,
          scheduleStartHour: true,
          scheduleEndHour: true,
          effectiveFrom: true,
        },
      }),
      prismaService.booking.findUnique({
        where: { id: compatibleResponse.body.id as string },
        select: { status: true, cancellationReason: true },
      }),
      prismaService.booking.findUnique({
        where: { id: incompatibleResponse.body.id as string },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
    ]);

    expect(scheduleVersions).toHaveLength(2);
    expect(scheduleVersions[0]).toMatchObject({
      timezone: 'UTC',
      scheduleStartHour: 8,
      scheduleEndHour: 18,
    });
    expect(scheduleVersions[1]).toMatchObject({
      timezone: 'UTC',
      scheduleStartHour: 9,
      scheduleEndHour: 17,
      effectiveFrom: expect.any(Date),
    });
    expect(compatibleBooking).toEqual({
      status: BookingStatus.ACTIVE,
      cancellationReason: null,
    });
    expect(incompatibleBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.SCHEDULE_INCOMPATIBLE,
      cancelledAt: expect.any(Date),
    });
  });
});
