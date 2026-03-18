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
  WorkspaceStatus,
} from '../../src/generated/prisma';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../../src/auth/email/email-provider.interface';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Domain rules integration', () => {
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
    process.env.NODE_ENV = 'test';
    process.env.API_PORT ??= '3001';
    process.env.DATABASE_URL ??=
      'postgresql://openspace:openspace@localhost:55432/openspace?schema=public';
    process.env.JWT_ACCESS_SECRET ??= '1234567890abcdef';
    process.env.JWT_REFRESH_SECRET ??= 'abcdef1234567890';
    process.env.JWT_ACCESS_TTL ??= '15m';
    process.env.JWT_REFRESH_TTL ??= '7d';
    process.env.EMAIL_VERIFICATION_TTL_MINUTES ??= '60';
    process.env.MAX_WORKSPACES_PER_USER = '2';
    process.env.MAX_ROOMS_PER_WORKSPACE = '2';
    process.env.MAX_USERS_PER_WORKSPACE = '2';
    process.env.MAX_PENDING_INVITATIONS_PER_WORKSPACE = '2';
    process.env.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE = '2';
    process.env.MAX_BOOKING_DAYS_AHEAD = '365';
    process.env.MAX_REGISTRATIONS_PER_HOUR_PER_IP = '999';
    process.env.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER = '999';
    process.env.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER = '999';
    process.env.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER = '999';
    process.env.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER = '999';

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
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
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

  it('enforces unique workspace names only across active workspaces', async () => {
    const admin = await createVerifiedUser('workspace-name-admin@example.com');
    const secondAdmin = await createVerifiedUser('workspace-name-admin-2@example.com');
    const adminToken = await accessTokenFor(admin.id, admin.email);
    const secondAdminToken = await accessTokenFor(secondAdmin.id, secondAdmin.email);

    const workspaceId = await createWorkspace(adminToken, 'Unique Workspace');

    const duplicateResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${secondAdminToken}`)
      .send({ name: 'Unique Workspace', timezone: 'UTC' });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body).toEqual({
      code: 'WORKSPACE_NAME_ALREADY_EXISTS',
      message: 'A workspace with this name already exists',
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

    const memberOneInvitation = await inviteMember(adminToken, workspaceId, 'member-one@example.com');
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

    const reinvitation = await inviteMember(adminToken, workspaceId, 'leave-member@example.com');
    await acceptInvitation(memberToken, reinvitation);

    const listResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/bookings?mine=true&includePast=true&includeCancelled=true`)
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

  it('cancels member workspaces and admin-owned workspaces when deleting an account', async () => {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const owner = await createVerifiedUser('delete-owner@example.com');
    const admin = await createVerifiedUser('delete-admin@example.com');

    const ownerToken = await accessTokenFor(owner.id, owner.email);
    const adminToken = await accessTokenFor(admin.id, admin.email);

    const memberWorkspaceId = await createWorkspace(adminToken, 'Participant Workspace');
    const memberRoomId = await createRoom(adminToken, memberWorkspaceId, 'Participant Room');
    const memberInvitation = await inviteMember(adminToken, memberWorkspaceId, 'delete-owner@example.com');
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

    const ownedWorkspaceId = await createWorkspace(ownerToken, 'Owned Workspace');

    const deleteResponse = await request(app.getHttpServer())
      .post('/api/auth/delete-account')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: 'delete-owner@example.com',
        password,
      });

    expect(deleteResponse.status).toBe(201);
    expect(deleteResponse.body).toEqual({ cancelled: true });

    const [user, membership, memberBooking, ownedWorkspace] = await Promise.all([
      prismaService.user.findUnique({
        where: { email: 'delete-owner@example.com' },
        select: { status: true, cancelledAt: true },
      }),
      prismaService.workspaceMember.findFirst({
        where: { workspaceId: memberWorkspaceId, userId: owner.id },
        select: { status: true },
      }),
      prismaService.booking.findUnique({
        where: { id: memberBookingResponse.body.id as string },
        select: { status: true, cancellationReason: true, cancelledAt: true },
      }),
      prismaService.workspace.findUnique({
        where: { id: ownedWorkspaceId },
        select: { status: true, cancelledAt: true },
      }),
    ]);

    expect(user).toEqual({
      status: UserStatus.CANCELLED,
      cancelledAt: expect.any(Date),
    });
    expect(membership).toEqual({ status: MembershipStatus.INACTIVE });
    expect(memberBooking).toMatchObject({
      status: BookingStatus.CANCELLED,
      cancellationReason: BookingCancellationReason.USER_LEFT_WORKSPACE,
      cancelledAt: expect.any(Date),
    });
    expect(ownedWorkspace).toEqual({
      status: WorkspaceStatus.CANCELLED,
      cancelledAt: expect.any(Date),
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

    const reRegisterResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
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


