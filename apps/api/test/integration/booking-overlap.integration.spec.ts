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
});
