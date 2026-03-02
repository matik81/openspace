import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  RateLimitOperationType,
  RateLimitSubjectType,
} from '@prisma/client';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import {
  EMAIL_PROVIDER,
  EmailProvider,
} from '../../src/auth/email/email-provider.interface';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

describe('Rate limits integration', () => {
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
    process.env.MAX_WORKSPACES_PER_USER = '999';
    process.env.MAX_ROOMS_PER_WORKSPACE = '999';
    process.env.MAX_USERS_PER_WORKSPACE = '999';
    process.env.MAX_PENDING_INVITATIONS_PER_WORKSPACE = '999';
    process.env.MAX_FUTURE_BOOKINGS_PER_USER_PER_WORKSPACE = '999';
    process.env.MAX_BOOKING_DAYS_AHEAD = '365';
    process.env.MAX_REGISTRATIONS_PER_HOUR_PER_IP = '2';
    process.env.MAX_WORKSPACE_CREATIONS_PER_HOUR_PER_USER = '2';
    process.env.MAX_ROOM_CREATIONS_PER_HOUR_PER_USER = '2';
    process.env.MAX_INVITATION_CREATIONS_PER_HOUR_PER_USER = '2';
    process.env.MAX_BOOKING_CREATIONS_PER_HOUR_PER_USER = '2';
    process.env.RATE_LIMIT_SUSPENSION_HOURS = '24';

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

  async function registerAndVerify(email: string, ipAddress: string) {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-forwarded-for', ipAddress)
      .send({
        firstName: 'Rate',
        lastName: 'Limited',
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

  async function createVerifiedUser(email: string) {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    return prismaService.user.create({
      data: {
        firstName: 'Rate',
        lastName: 'User',
        email: email.toLowerCase(),
        passwordHash: hashSync(password, 12),
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
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

  async function createWorkspace(token: string, name: string) {
    const response = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, timezone: 'UTC' });

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

  function futureDateIso(daysAhead: number, hour: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  async function expectUserSuspension(operationType: RateLimitOperationType, userId: string) {
    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const suspension = await prismaService.rateLimitSuspension.findFirst({
      where: {
        subjectType: RateLimitSubjectType.USER,
        userId,
        operationType,
      },
      orderBy: { expiresAt: 'desc' },
      select: { expiresAt: true },
    });

    expect(suspension).toEqual({ expiresAt: expect.any(Date) });
    expect(suspension!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  }

  it('suspends an IP for 24 hours after exceeding the registration limit', async () => {
    const ipAddress = '203.0.113.10';

    await registerAndVerify('register-1@example.com', ipAddress);
    await registerAndVerify('register-2@example.com', ipAddress);

    const blockedResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-forwarded-for', ipAddress)
      .send({
        firstName: 'Blocked',
        lastName: 'User',
        email: 'register-3@example.com',
        password,
      });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('IP_SUSPENDED');

    if (!prismaService) {
      throw new Error('Prisma service unavailable');
    }

    const suspension = await prismaService.rateLimitSuspension.findFirst({
      where: {
        subjectType: RateLimitSubjectType.IP,
        ipAddress,
        operationType: RateLimitOperationType.REGISTER,
      },
      orderBy: { expiresAt: 'desc' },
      select: { expiresAt: true },
    });

    expect(suspension).toEqual({ expiresAt: expect.any(Date) });

    const stillBlockedResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-forwarded-for', ipAddress)
      .send({
        firstName: 'Still',
        lastName: 'Blocked',
        email: 'register-4@example.com',
        password,
      });

    expect(stillBlockedResponse.status).toBe(429);
    expect(stillBlockedResponse.body.code).toBe('IP_SUSPENDED');
  });

  it('suspends a user after exceeding workspace creation limits', async () => {
    const user = await createVerifiedUser('workspace-rate@example.com');
    const token = await accessTokenFor(user.id, 'workspace-rate@example.com');

    await createWorkspace(token, 'Rate Workspace A');
    await createWorkspace(token, 'Rate Workspace B');

    const blockedResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rate Workspace C', timezone: 'UTC' });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('USER_SUSPENDED');

    await expectUserSuspension(RateLimitOperationType.CREATE_WORKSPACE, user.id);

    const loginWhileSuspendedResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'workspace-rate@example.com',
        password,
      });

    expect(loginWhileSuspendedResponse.status).toBe(429);
    expect(loginWhileSuspendedResponse.body.code).toBe('USER_SUSPENDED');
  });

  it('suspends a user after exceeding room creation limits', async () => {
    const user = await createVerifiedUser('room-rate@example.com');
    const token = await accessTokenFor(user.id, 'room-rate@example.com');
    const workspaceId = await createWorkspace(token, 'Room Rate Workspace');

    await createRoom(token, workspaceId, 'Rate Room A');
    await createRoom(token, workspaceId, 'Rate Room B');

    const blockedResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/rooms`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rate Room C' });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('USER_SUSPENDED');

    await expectUserSuspension(RateLimitOperationType.CREATE_ROOM, user.id);
  });

  it('suspends a user after exceeding invitation creation limits', async () => {
    const user = await createVerifiedUser('invite-rate@example.com');
    await createVerifiedUser('invite-target-1@example.com');
    await createVerifiedUser('invite-target-2@example.com');
    await createVerifiedUser('invite-target-3@example.com');
    const token = await accessTokenFor(user.id, 'invite-rate@example.com');
    const workspaceId = await createWorkspace(token, 'Invite Rate Workspace');

    for (const email of ['invite-target-1@example.com', 'invite-target-2@example.com']) {
      const response = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/invitations`)
        .set('Authorization', `Bearer ${token}`)
        .send({ email });
      expect(response.status).toBe(201);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'invite-target-3@example.com' });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('USER_SUSPENDED');

    await expectUserSuspension(RateLimitOperationType.CREATE_INVITATION, user.id);
  });

  it('suspends a user after exceeding booking creation limits', async () => {
    const user = await createVerifiedUser('booking-rate@example.com');
    const token = await accessTokenFor(user.id, 'booking-rate@example.com');
    const workspaceId = await createWorkspace(token, 'Booking Rate Workspace');
    const roomId = await createRoom(token, workspaceId, 'Booking Rate Room');

    for (const [dayOffset, hour] of [
      [5, 9],
      [6, 10],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/bookings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          roomId,
          startAt: futureDateIso(dayOffset, hour),
          endAt: futureDateIso(dayOffset, hour + 1),
          subject: `Rate booking ${dayOffset}`,
        });
      expect(response.status).toBe(201);
    }

    const blockedResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/bookings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        roomId,
        startAt: futureDateIso(7, 11),
        endAt: futureDateIso(7, 12),
        subject: 'Blocked booking',
      });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body.code).toBe('USER_SUSPENDED');

    await expectUserSuspension(RateLimitOperationType.CREATE_BOOKING, user.id);
  });
});
