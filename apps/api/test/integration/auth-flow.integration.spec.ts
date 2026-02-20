import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { EMAIL_PROVIDER, EmailProvider } from '../../src/auth/email/email-provider.interface';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

type MockUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockVerificationToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

function createPrismaMock(): PrismaService {
  const users: MockUser[] = [];
  const verificationTokens: MockVerificationToken[] = [];

  const delegates = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return users.find((user) => user.email === where.email) ?? null;
        }
        if (where.id) {
          return users.find((user) => user.id === where.id) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data, select }: { data: Partial<MockUser>; select?: Record<string, boolean> }) => {
        const now = new Date();
        const user: MockUser = {
          id: randomUUID(),
          firstName: data.firstName as string,
          lastName: data.lastName as string,
          email: data.email as string,
          passwordHash: data.passwordHash as string,
          emailVerifiedAt: null,
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
          createdAt: now,
          updatedAt: now,
        };
        users.push(user);

        if (select) {
          const selected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            selected[key] = user[key as keyof MockUser];
          }
          return selected;
        }
        return user;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockUser> }) => {
        const user = users.find((item) => item.id === where.id);
        if (!user) {
          throw new Error('User not found');
        }
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      }),
    },
    emailVerificationToken: {
      create: jest.fn(async ({ data }: { data: Partial<MockVerificationToken> }) => {
        const record: MockVerificationToken = {
          id: randomUUID(),
          userId: data.userId as string,
          tokenHash: data.tokenHash as string,
          expiresAt: data.expiresAt as Date,
          consumedAt: null,
          createdAt: new Date(),
        };
        verificationTokens.push(record);
        return record;
      }),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { tokenHash: string; consumedAt: null; expiresAt: { gt: Date } };
        }) => {
          const result = verificationTokens.find(
            (token) =>
              token.tokenHash === where.tokenHash &&
              token.consumedAt === null &&
              token.expiresAt > where.expiresAt.gt,
          );
          if (!result) {
            return null;
          }
          return {
            id: result.id,
            userId: result.userId,
          };
        },
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { consumedAt: Date } }) => {
        const token = verificationTokens.find((item) => item.id === where.id);
        if (!token) {
          throw new Error('Token not found');
        }
        token.consumedAt = data.consumedAt;
        return token;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { userId: string; consumedAt: null; id: { not: string } };
          data: { consumedAt: Date };
        }) => {
          let count = 0;
          for (const token of verificationTokens) {
            if (
              token.userId === where.userId &&
              token.consumedAt === null &&
              token.id !== where.id.not
            ) {
              token.consumedAt = data.consumedAt;
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };

  const prisma = {
    ...delegates,
    $transaction: jest.fn(
      async (callback: (tx: typeof delegates) => Promise<unknown>) => callback(delegates),
    ),
    $queryRawUnsafe: jest.fn(async () => [{ '?column?': 1 }]),
  };

  return prisma as unknown as PrismaService;
}

describe('Auth flow integration', () => {
  let app: INestApplication;
  let appModule: { AppModule: unknown };
  let sentVerificationToken = '';
  const prismaMock = createPrismaMock();
  const emailProviderMock: EmailProvider = {
    sendVerificationEmail: jest.fn(async ({ token }) => {
      sentVerificationToken = token;
    }),
  };

  beforeAll(async () => {
    process.env = {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: '3001',
      DATABASE_URL: 'postgresql://openspace:openspace@localhost:5432/openspace?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: '1234567890abcdef',
      JWT_REFRESH_SECRET: 'abcdef1234567890',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      EMAIL_VERIFICATION_TTL_MINUTES: '60',
    };

    appModule = await import('../../src/app.module');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [appModule.AppModule as never],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(emailProviderMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('supports register, blocks login until verification, then allows login and refresh', async () => {
    const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'strong-password',
    });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body).toMatchObject({
      email: 'ada@example.com',
      requiresEmailVerification: true,
    });
    expect(sentVerificationToken).toEqual(expect.any(String));

    const loginBeforeVerification = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'ada@example.com',
        password: 'strong-password',
      });

    expect(loginBeforeVerification.status).toBe(403);
    expect(loginBeforeVerification.body).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email must be verified before login',
    });

    const verifyResponse = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: sentVerificationToken });

    expect(verifyResponse.status).toBe(201);
    expect(verifyResponse.body).toEqual({ verified: true });

    const loginAfterVerification = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'ada@example.com',
        password: 'strong-password',
      });

    expect(loginAfterVerification.status).toBe(201);
    expect(loginAfterVerification.body.accessToken).toEqual(expect.any(String));
    expect(loginAfterVerification.body.refreshToken).toEqual(expect.any(String));

    const refreshResponse = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({
        refreshToken: loginAfterVerification.body.refreshToken,
      });

    expect(refreshResponse.status).toBe(201);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(refreshResponse.body.refreshToken).toEqual(expect.any(String));

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(prismaMock.emailVerificationToken.update).toHaveBeenCalled();
  });

  it('rejects invalid verification tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: 'invalid-token' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_VERIFICATION_TOKEN');
  });
});
