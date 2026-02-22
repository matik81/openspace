import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../../src/auth/email/email-provider.interface';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Booking overlap integration', () => {
  let app: INestApplication;
  let prismaService: PrismaService | null = null;
  let appModule: { AppModule: unknown };
  const verificationTokensByEmail: Record<string, string> = {};
  const emailProviderMock: EmailProvider = {
    sendVerificationEmail: jest.fn(async ({ to, token }) => {
      verificationTokensByEmail[to.toLowerCase()] = token;
    }),
  };
  const password = 'strong-password';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_PORT ??= '3001';
    process.env.DATABASE_URL ??=
      'postgresql://openspace:openspace@localhost:5432/openspace?schema=public';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET ??= '1234567890abcdef';
    process.env.JWT_REFRESH_SECRET ??= 'abcdef1234567890';
    process.env.JWT_ACCESS_TTL ??= '15m';
    process.env.JWT_REFRESH_TTL ??= '7d';
    process.env.EMAIL_VERIFICATION_TTL_MINUTES ??= '60';

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
  });

  beforeEach(async () => {
    if (!prismaService) {
      return;
    }

    await cleanDatabase();
  });

  afterAll(async () => {
    if (app && prismaService) {
      await cleanDatabase();
      await app.close();
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
    await prismaService.workspace.deleteMany();
    await prismaService.emailVerificationToken.deleteMany();
    await prismaService.user.deleteMany();
  }

  async function registerAndVerify(email: string): Promise<void> {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'User',
        lastName: 'Example',
        email,
        password,
      });

    expect(registerResponse.status).toBe(201);
    const verificationToken = verificationTokensByEmail[email.toLowerCase()];
    expect(verificationToken).toEqual(expect.any(String));

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({
        token: verificationToken,
      });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.body).toEqual({ verified: true });
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({
      email,
      password,
    });

    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  it('rejects overlapping active bookings with BOOKING_OVERLAP', async () => {
    const adminEmail = 'booking-admin@example.com';
    await registerAndVerify(adminEmail);
    const adminToken = await login(adminEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Operations',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Room A',
      });

    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const firstBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2026-02-20T10:00:00.000Z',
        endAt: '2026-02-20T11:00:00.000Z',
        subject: 'Incident review',
      });

    expect(firstBookingResponse.status).toBe(201);

    const overlappingBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2026-02-20T10:30:00.000Z',
        endAt: '2026-02-20T11:30:00.000Z',
        subject: 'Overlapping slot',
      });

    expect(overlappingBookingResponse.status).toBe(409);
    expect(overlappingBookingResponse.body).toEqual({
      code: 'BOOKING_OVERLAP',
      message: 'Booking overlaps with an existing active booking',
    });
  });

  it('cancels bookings softly and allows rebooking the same time range', async () => {
    const adminEmail = 'booking-admin-cancel@example.com';
    await registerAndVerify(adminEmail);
    const adminToken = await login(adminEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Support',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Room B',
      });

    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const createBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2026-02-20T13:00:00.000Z',
        endAt: '2026-02-20T14:00:00.000Z',
        subject: 'Ticket triage',
      });

    expect(createBookingResponse.status).toBe(201);
    expect(createBookingResponse.body.status).toBe('ACTIVE');
    const bookingId = createBookingResponse.body.id as string;

    const cancelResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cancelResponse.status).toBe(201);
    expect(cancelResponse.body.status).toBe('CANCELLED');

    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const persistedBooking = await prismaService.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });
    expect(persistedBooking).toEqual({
      id: bookingId,
      status: 'CANCELLED',
    });

    const secondBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2026-02-20T13:00:00.000Z',
        endAt: '2026-02-20T14:00:00.000Z',
        subject: 'Replacement booking',
      });

    expect(secondBookingResponse.status).toBe(201);
    expect(secondBookingResponse.body.status).toBe('ACTIVE');
  });

  it('lists bookings with default own-upcoming-active filter and optional history toggles', async () => {
    const adminEmail = 'booking-list-admin@example.com';
    const memberEmail = 'booking-list-member@example.com';
    const pendingEmail = 'booking-list-pending@example.com';

    await registerAndVerify(adminEmail);
    await registerAndVerify(memberEmail);
    await registerAndVerify(pendingEmail);
    const adminToken = await login(adminEmail);
    const memberToken = await login(memberEmail);
    const pendingToken = await login(pendingEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Planning',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const inviteMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: memberEmail,
      });

    expect(inviteMemberResponse.status).toBe(201);
    const memberInvitationId = inviteMemberResponse.body.id as string;

    const acceptInvitationResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${memberInvitationId}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(acceptInvitationResponse.status).toBe(201);

    const invitePendingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: pendingEmail,
      });
    expect(invitePendingResponse.status).toBe(201);

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Main Room',
      });

    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const pastBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        roomId,
        startAt: '2021-05-01T09:00:00.000Z',
        endAt: '2021-05-01T10:00:00.000Z',
        subject: 'Past booking',
      });

    expect(pastBookingResponse.status).toBe(201);

    const activeFutureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        roomId,
        startAt: '2099-05-01T09:00:00.000Z',
        endAt: '2099-05-01T10:00:00.000Z',
        subject: 'Future active booking',
      });

    expect(activeFutureBookingResponse.status).toBe(201);
    const activeFutureBookingId = activeFutureBookingResponse.body.id as string;

    const cancelledFutureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        roomId,
        startAt: '2099-05-01T11:00:00.000Z',
        endAt: '2099-05-01T12:00:00.000Z',
        subject: 'Future cancelled booking',
      });

    expect(cancelledFutureBookingResponse.status).toBe(201);
    const cancelledFutureBookingId = cancelledFutureBookingResponse.body.id as string;

    const cancelFutureBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings/${cancelledFutureBookingId}/cancel`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(cancelFutureBookingResponse.status).toBe(201);
    expect(cancelFutureBookingResponse.body.status).toBe('CANCELLED');

    const defaultListResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(defaultListResponse.status).toBe(200);
    expect(defaultListResponse.body.items).toHaveLength(1);
    expect(defaultListResponse.body.items[0]).toMatchObject({
      id: activeFutureBookingId,
      status: 'ACTIVE',
      createdByUserId: expect.any(String),
      roomName: 'Main Room',
    });

    const includeHistoryResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/bookings?mine=true&includePast=true&includeCancelled=true`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(includeHistoryResponse.status).toBe(200);
    expect(includeHistoryResponse.body.items).toHaveLength(3);
    const returnedIds = includeHistoryResponse.body.items.map((item: { id: string }) => item.id);
    expect(returnedIds).toEqual([
      pastBookingResponse.body.id as string,
      activeFutureBookingId,
      cancelledFutureBookingId,
    ]);

    const pendingListResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(pendingListResponse.status).toBe(403);
    expect(pendingListResponse.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only active workspace members can manage bookings',
    });
  });

  it('enforces workspace admin access for members and invitations list endpoints', async () => {
    const adminEmail = 'admin-lists@example.com';
    const memberEmail = 'member-lists@example.com';
    const pendingEmail = 'pending-lists@example.com';
    const outsiderEmail = 'outsider-lists@example.com';

    await registerAndVerify(adminEmail);
    await registerAndVerify(memberEmail);
    await registerAndVerify(pendingEmail);
    await registerAndVerify(outsiderEmail);

    const adminToken = await login(adminEmail);
    const memberToken = await login(memberEmail);
    const pendingToken = await login(pendingEmail);
    const outsiderToken = await login(outsiderEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Admin Lists',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const inviteMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: memberEmail,
      });
    expect(inviteMemberResponse.status).toBe(201);
    const memberInvitationId = inviteMemberResponse.body.id as string;

    const invitePendingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: pendingEmail,
      });
    expect(invitePendingResponse.status).toBe(201);
    const pendingInvitationId = invitePendingResponse.body.id as string;

    const acceptMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${memberInvitationId}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(acceptMemberResponse.status).toBe(201);

    const adminMembersResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminMembersResponse.status).toBe(200);
    expect(adminMembersResponse.body.items).toHaveLength(2);
    const memberEmails = adminMembersResponse.body.items.map((item: { email: string }) => item.email);
    expect(memberEmails.sort()).toEqual([adminEmail, memberEmail].sort());

    const adminInvitationsResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminInvitationsResponse.status).toBe(200);
    expect(adminInvitationsResponse.body.items).toHaveLength(1);
    expect(adminInvitationsResponse.body.items[0]).toMatchObject({
      id: pendingInvitationId,
      email: pendingEmail,
      status: 'PENDING',
    });

    const memberMembersResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberMembersResponse.status).toBe(403);
    expect(memberMembersResponse.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only workspace admins can perform this action',
    });

    const outsiderMembersResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderMembersResponse.status).toBe(403);
    expect(outsiderMembersResponse.body).toEqual({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });

    const pendingInvitationsResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(pendingInvitationsResponse.status).toBe(403);
    expect(pendingInvitationsResponse.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only workspace admins can perform this action',
    });
  });

  it('allows room read access for active members and blocks pending or non-visible users', async () => {
    const adminEmail = 'room-admin@example.com';
    const memberEmail = 'room-member@example.com';
    const pendingEmail = 'room-pending@example.com';
    const outsiderEmail = 'room-outsider@example.com';

    await registerAndVerify(adminEmail);
    await registerAndVerify(memberEmail);
    await registerAndVerify(pendingEmail);
    await registerAndVerify(outsiderEmail);

    const adminToken = await login(adminEmail);
    const memberToken = await login(memberEmail);
    const pendingToken = await login(pendingEmail);
    const outsiderToken = await login(outsiderEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Room Visibility',
      });
    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Shared Room',
      });
    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const inviteMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: memberEmail,
      });
    expect(inviteMemberResponse.status).toBe(201);
    const memberInvitationId = inviteMemberResponse.body.id as string;

    const invitePendingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: pendingEmail,
      });
    expect(invitePendingResponse.status).toBe(201);

    const acceptMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${memberInvitationId}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(acceptMemberResponse.status).toBe(201);

    const memberRoomsResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberRoomsResponse.status).toBe(200);
    expect(memberRoomsResponse.body.items).toHaveLength(1);
    expect(memberRoomsResponse.body.items[0].id).toBe(roomId);

    const memberRoomResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberRoomResponse.status).toBe(200);
    expect(memberRoomResponse.body.id).toBe(roomId);

    const pendingRoomsResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${pendingToken}`);
    expect(pendingRoomsResponse.status).toBe(403);
    expect(pendingRoomsResponse.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only active workspace members can view rooms',
    });

    const outsiderRoomsResponse = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderRoomsResponse.status).toBe(403);
    expect(outsiderRoomsResponse.body).toEqual({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });
  });

  it('rejects bookings that cross a local date boundary in the workspace timezone', async () => {
    const adminEmail = 'booking-date-boundary-admin@example.com';
    await registerAndVerify(adminEmail);
    const adminToken = await login(adminEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Timezone Rules',
        timezone: 'Europe/Paris',
      });
    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Boundary Room',
      });
    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const response = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2099-05-01T21:30:00.000Z',
        endAt: '2099-05-01T22:30:00.000Z',
        subject: 'Cross midnight local',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'BOOKING_MULTI_DAY_NOT_ALLOWED',
      message: 'Booking must start and end on the same date in the workspace timezone',
    });
  });

  it('blocks past booking dates but allows same-day past-time bookings', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-22T12:00:00.000Z'));

    try {
      const adminEmail = 'booking-past-date-admin@example.com';
      await registerAndVerify(adminEmail);
      const adminToken = await login(adminEmail);

      const createWorkspaceResponse = await request(app.getHttpServer())
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Past Date Rule',
          timezone: 'UTC',
        });
      expect(createWorkspaceResponse.status).toBe(201);
      const workspaceId = createWorkspaceResponse.body.id as string;

      const createRoomResponse = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/rooms`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Past Rule Room',
        });
      expect(createRoomResponse.status).toBe(201);
      const roomId = createRoomResponse.body.id as string;

      const pastDateResponse = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/bookings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId,
          startAt: '2026-02-21T10:00:00.000Z',
          endAt: '2026-02-21T11:00:00.000Z',
          subject: 'Yesterday booking',
        });

      expect(pastDateResponse.status).toBe(400);
      expect(pastDateResponse.body).toEqual({
        code: 'BOOKING_PAST_DATE_NOT_ALLOWED',
        message: 'Booking date cannot be in the past',
      });

      const sameDayPastTimeResponse = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/bookings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId,
          startAt: '2026-02-22T08:00:00.000Z',
          endAt: '2026-02-22T09:00:00.000Z',
          subject: 'Same day past time',
        });

      expect(sameDayPastTimeResponse.status).toBe(201);
      expect(sameDayPastTimeResponse.body).toMatchObject({
        status: 'ACTIVE',
        roomId,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows admins to update workspace settings and blocks members', async () => {
    const adminEmail = 'workspace-settings-admin@example.com';
    const memberEmail = 'workspace-settings-member@example.com';
    await registerAndVerify(adminEmail);
    await registerAndVerify(memberEmail);
    const adminToken = await login(adminEmail);
    const memberToken = await login(memberEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Old Workspace Name',
        timezone: 'UTC',
      });
    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const inviteMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: memberEmail,
      });
    expect(inviteMemberResponse.status).toBe(201);

    const acceptMemberResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${inviteMemberResponse.body.id as string}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(acceptMemberResponse.status).toBe(201);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Workspace Name',
        timezone: 'Europe/Rome',
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      id: workspaceId,
      name: 'Updated Workspace Name',
      timezone: 'Europe/Rome',
    });

    const adminListResponse = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminListResponse.status).toBe(200);
    expect(adminListResponse.body.items).toContainEqual(
      expect.objectContaining({
        id: workspaceId,
        name: 'Updated Workspace Name',
        timezone: 'Europe/Rome',
      }),
    );

    const memberUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        name: 'Member Cannot Update',
      });
    expect(memberUpdateResponse.status).toBe(403);
    expect(memberUpdateResponse.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only workspace admins can perform this action',
    });
  });

  it('requires safe confirmation to cancel a workspace and hard deletes on success', async () => {
    const adminEmail = 'workspace-cancel-admin@example.com';
    const pendingEmail = 'workspace-cancel-pending@example.com';
    await registerAndVerify(adminEmail);
    await registerAndVerify(pendingEmail);
    const adminToken = await login(adminEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cancel Me',
        timezone: 'UTC',
      });
    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const createRoomResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Room To Delete' });
    expect(createRoomResponse.status).toBe(201);
    const roomId = createRoomResponse.body.id as string;

    const createBookingResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        startAt: '2099-08-01T10:00:00.000Z',
        endAt: '2099-08-01T11:00:00.000Z',
        subject: 'Future booking before cancel',
      });
    expect(createBookingResponse.status).toBe(201);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: pendingEmail,
      });
    expect(inviteResponse.status).toBe(201);

    const expectedFailure = {
      code: 'WORKSPACE_CANCEL_CONFIRMATION_FAILED',
      message: 'Workspace cancellation confirmation failed',
    };

    const wrongNameResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workspaceName: 'Wrong Name',
        email: adminEmail,
        password,
      });
    expect(wrongNameResponse.status).toBe(403);
    expect(wrongNameResponse.body).toEqual(expectedFailure);

    const wrongEmailResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workspaceName: 'Cancel Me',
        email: 'not-admin@example.com',
        password,
      });
    expect(wrongEmailResponse.status).toBe(403);
    expect(wrongEmailResponse.body).toEqual(expectedFailure);

    const wrongPasswordResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workspaceName: 'Cancel Me',
        email: adminEmail,
        password: 'wrong-password',
      });
    expect(wrongPasswordResponse.status).toBe(403);
    expect(wrongPasswordResponse.body).toEqual(expectedFailure);

    const cancelResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workspaceName: 'Cancel Me',
        email: adminEmail,
        password,
      });
    expect(cancelResponse.status).toBe(201);
    expect(cancelResponse.body).toEqual({ deleted: true });

    const adminListResponse = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminListResponse.status).toBe(200);
    expect(adminListResponse.body.items).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: workspaceId })]),
    );

    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const [workspace, room, booking, invitation, memberships] = await Promise.all([
      prismaService.workspace.findUnique({ where: { id: workspaceId } }),
      prismaService.room.findUnique({ where: { id: roomId } }),
      prismaService.booking.findFirst({ where: { workspaceId } }),
      prismaService.invitation.findFirst({ where: { workspaceId } }),
      prismaService.workspaceMember.findMany({ where: { workspaceId } }),
    ]);

    expect(workspace).toBeNull();
    expect(room).toBeNull();
    expect(booking).toBeNull();
    expect(invitation).toBeNull();
    expect(memberships).toHaveLength(0);
  });
});
