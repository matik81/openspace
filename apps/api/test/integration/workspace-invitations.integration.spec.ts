import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InvitationStatus,
  MembershipStatus,
  WorkspaceRole,
} from '@prisma/client';
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

type MockWorkspace = {
  id: string;
  name: string;
  timezone: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockWorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
};

type MockInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  invitedByUserId: string;
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

type MockUserWorkspacePreference = {
  userId: string;
  workspaceId: string;
  sortOrder: number;
};

function selectRecord<T extends Record<string, unknown>>(
  record: T,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) {
    return { ...record };
  }

  const selected: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled === true) {
      selected[key] = record[key];
    }
  }

  return selected;
}

function createPrismaMock(): PrismaService {
  const users: MockUser[] = [];
  const workspaces: MockWorkspace[] = [];
  const members: MockWorkspaceMember[] = [];
  const invitations: MockInvitation[] = [];
  const verificationTokens: MockVerificationToken[] = [];
  const userWorkspacePreferences: MockUserWorkspacePreference[] = [];

  const delegates = {
    user: {
      findUnique: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { email?: string; id?: string };
          select?: Record<string, unknown>;
        }) => {
          const user = where.email
            ? users.find((item) => item.email === where.email) ?? null
            : where.id
              ? users.find((item) => item.id === where.id) ?? null
              : null;

          if (!user) {
            return null;
          }

          return selectRecord(
            user as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      create: jest.fn(
        async ({
          data,
          select,
        }: {
          data: Partial<MockUser>;
          select?: Record<string, unknown>;
        }) => {
          const now = new Date();
          const user: MockUser = {
            id: randomUUID(),
            firstName: data.firstName as string,
            lastName: data.lastName as string,
            email: (data.email as string).toLowerCase(),
            passwordHash: data.passwordHash as string,
            emailVerifiedAt: null,
            refreshTokenHash: null,
            refreshTokenExpiresAt: null,
            createdAt: now,
            updatedAt: now,
          };
          users.push(user);

          return selectRecord(
            user as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockUser>;
        }) => {
          const user = users.find((item) => item.id === where.id);
          if (!user) {
            throw new Error('User not found');
          }

          Object.assign(user, data, {
            updatedAt: new Date(),
          });
          return user;
        },
      ),
    },
    workspace: {
      create: jest.fn(
        async ({
          data,
          select,
        }: {
          data: Partial<MockWorkspace>;
          select?: Record<string, unknown>;
        }) => {
          const now = new Date();
          const workspace: MockWorkspace = {
            id: randomUUID(),
            name: data.name as string,
            timezone: data.timezone as string,
            createdByUserId: data.createdByUserId as string,
            createdAt: now,
            updatedAt: now,
          };
          workspaces.push(workspace);

          return selectRecord(
            workspace as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
    },
    workspaceMember: {
      create: jest.fn(async ({ data }: { data: Partial<MockWorkspaceMember> }) => {
        const now = new Date();
        const member: MockWorkspaceMember = {
          id: randomUUID(),
          workspaceId: data.workspaceId as string,
          userId: data.userId as string,
          role: (data.role as WorkspaceRole) ?? WorkspaceRole.MEMBER,
          status: (data.status as MembershipStatus) ?? MembershipStatus.ACTIVE,
          createdAt: now,
          updatedAt: now,
        };
        members.push(member);
        return member;
      }),
      findFirst: jest.fn(
        async ({
          where,
          select,
        }: {
          where: {
            workspaceId?: string;
            userId?: string;
            role?: WorkspaceRole;
            status?: MembershipStatus;
          };
          select?: Record<string, unknown>;
        }) => {
          const member =
            members.find((item) => {
              if (where.workspaceId && item.workspaceId !== where.workspaceId) {
                return false;
              }
              if (where.userId && item.userId !== where.userId) {
                return false;
              }
              if (where.role && item.role !== where.role) {
                return false;
              }
              if (where.status && item.status !== where.status) {
                return false;
              }
              return true;
            }) ?? null;

          if (!member) {
            return null;
          }

          return selectRecord(
            member as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { userId?: string; status?: MembershipStatus };
          select: {
            role: true;
            status: true;
            workspace: {
              select: {
                id: true;
                name: true;
                timezone: true;
                createdAt: true;
                updatedAt: true;
              };
            };
          };
        }) => {
          const filtered = members.filter((item) => {
            if (where.userId && item.userId !== where.userId) {
              return false;
            }
            if (where.status && item.status !== where.status) {
              return false;
            }
            return true;
          });

          return filtered
            .map((member) => {
              const workspace = workspaces.find(
                (item) => item.id === member.workspaceId,
              );
              if (!workspace) {
                return null;
              }

              return {
                role: member.role,
                status: member.status,
                workspace: selectRecord(
                  workspace as unknown as Record<string, unknown>,
                  select.workspace.select,
                ),
              };
            })
            .filter((value): value is NonNullable<typeof value> => value !== null);
        },
      ),
      upsert: jest.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { workspaceId_userId: { workspaceId: string; userId: string } };
          update: Partial<MockWorkspaceMember>;
          create: Partial<MockWorkspaceMember>;
        }) => {
          const key = where.workspaceId_userId;
          const existing = members.find(
            (item) =>
              item.workspaceId === key.workspaceId && item.userId === key.userId,
          );

          if (existing) {
            Object.assign(existing, update, {
              updatedAt: new Date(),
            });
            return existing;
          }

          const now = new Date();
          const member: MockWorkspaceMember = {
            id: randomUUID(),
            workspaceId: create.workspaceId as string,
            userId: create.userId as string,
            role: (create.role as WorkspaceRole) ?? WorkspaceRole.MEMBER,
            status: (create.status as MembershipStatus) ?? MembershipStatus.ACTIVE,
            createdAt: now,
            updatedAt: now,
          };
          members.push(member);
          return member;
        },
      ),
    },
    invitation: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            status: InvitationStatus;
            expiresAt: { lte: Date };
            workspaceId?: string;
            email?: string;
          };
          data: Partial<MockInvitation>;
        }) => {
          let count = 0;
          for (const invitation of invitations) {
            if (invitation.status !== where.status) {
              continue;
            }
            if (invitation.expiresAt > where.expiresAt.lte) {
              continue;
            }
            if (where.workspaceId && invitation.workspaceId !== where.workspaceId) {
              continue;
            }
            if (where.email && invitation.email !== where.email) {
              continue;
            }

            Object.assign(invitation, data, {
              updatedAt: new Date(),
            });
            count += 1;
          }
          return { count };
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          select,
        }: {
          where: {
            workspaceId?: string;
            email?: string;
            status?: InvitationStatus;
            expiresAt?: { gt: Date };
          };
          select?: Record<string, unknown>;
        }) => {
          const invitation =
            invitations.find((item) => {
              if (where.workspaceId && item.workspaceId !== where.workspaceId) {
                return false;
              }
              if (where.email && item.email !== where.email) {
                return false;
              }
              if (where.status && item.status !== where.status) {
                return false;
              }
              if (where.expiresAt && !(item.expiresAt > where.expiresAt.gt)) {
                return false;
              }
              return true;
            }) ?? null;

          if (!invitation) {
            return null;
          }

          return selectRecord(
            invitation as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where: {
            email: string;
            status: InvitationStatus;
            expiresAt: { gt: Date };
          };
          select: {
            id: true;
            status: true;
            email: true;
            expiresAt: true;
            invitedByUserId: true;
            createdAt: true;
            workspace: {
              select: {
                id: true;
                name: true;
                timezone: true;
                createdAt: true;
                updatedAt: true;
              };
            };
          };
        }) => {
          const filtered = invitations.filter(
            (invitation) =>
              invitation.email === where.email &&
              invitation.status === where.status &&
              invitation.expiresAt > where.expiresAt.gt,
          );

          return filtered
            .map((invitation) => {
              const workspace = workspaces.find(
                (item) => item.id === invitation.workspaceId,
              );
              if (!workspace) {
                return null;
              }

              return {
                id: invitation.id,
                status: invitation.status,
                email: invitation.email,
                expiresAt: invitation.expiresAt,
                invitedByUserId: invitation.invitedByUserId,
                createdAt: invitation.createdAt,
                workspace: selectRecord(
                  workspace as unknown as Record<string, unknown>,
                  select.workspace.select,
                ),
              };
            })
            .filter((value): value is NonNullable<typeof value> => value !== null);
        },
      ),
      create: jest.fn(
        async ({
          data,
          select,
        }: {
          data: Partial<MockInvitation>;
          select?: Record<string, unknown>;
        }) => {
          const now = new Date();
          const invitation: MockInvitation = {
            id: randomUUID(),
            workspaceId: data.workspaceId as string,
            email: (data.email as string).toLowerCase(),
            tokenHash: data.tokenHash as string,
            status: (data.status as InvitationStatus) ?? InvitationStatus.PENDING,
            expiresAt: data.expiresAt as Date,
            invitedByUserId: data.invitedByUserId as string,
            createdAt: now,
            updatedAt: now,
          };
          invitations.push(invitation);

          return selectRecord(
            invitation as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      findUnique: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { id: string };
          select?: Record<string, unknown>;
        }) => {
          const invitation =
            invitations.find((item) => item.id === where.id) ?? null;
          if (!invitation) {
            return null;
          }

          return selectRecord(
            invitation as unknown as Record<string, unknown>,
            select,
          );
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<MockInvitation>;
        }) => {
          const invitation = invitations.find((item) => item.id === where.id);
          if (!invitation) {
            throw new Error('Invitation not found');
          }
          Object.assign(invitation, data, {
            updatedAt: new Date(),
          });
          return invitation;
        },
      ),
    },
    emailVerificationToken: {
      create: jest.fn(async ({ data }: { data: Partial<MockVerificationToken> }) => {
        const token: MockVerificationToken = {
          id: randomUUID(),
          userId: data.userId as string,
          tokenHash: data.tokenHash as string,
          expiresAt: data.expiresAt as Date,
          consumedAt: null,
          createdAt: new Date(),
        };
        verificationTokens.push(token);
        return token;
      }),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { tokenHash: string; consumedAt: null; expiresAt: { gt: Date } };
        }) => {
          const token =
            verificationTokens.find(
              (item) =>
                item.tokenHash === where.tokenHash &&
                item.consumedAt === where.consumedAt &&
                item.expiresAt > where.expiresAt.gt,
            ) ?? null;

          if (!token) {
            return null;
          }

          return {
            id: token.id,
            userId: token.userId,
          };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { consumedAt: Date };
        }) => {
          const token = verificationTokens.find((item) => item.id === where.id);
          if (!token) {
            throw new Error('Verification token not found');
          }

          token.consumedAt = data.consumedAt;
          return token;
        },
      ),
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
              token.consumedAt === where.consumedAt &&
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
    userWorkspacePreference: {
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { userId: string; workspaceId: { in: string[] } };
          select: { workspaceId: true; sortOrder: true };
        }) =>
          userWorkspacePreferences
            .filter(
              (item) =>
                item.userId === where.userId &&
                where.workspaceId.in.includes(item.workspaceId),
            )
            .map((item) =>
              selectRecord(item as unknown as Record<string, unknown>, select),
            ),
      ),
      upsert: jest.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { userId_workspaceId: { userId: string; workspaceId: string } };
          update: Partial<MockUserWorkspacePreference>;
          create: MockUserWorkspacePreference;
        }) => {
          const existing = userWorkspacePreferences.find(
            (item) =>
              item.userId === where.userId_workspaceId.userId &&
              item.workspaceId === where.userId_workspaceId.workspaceId,
          );

          if (existing) {
            Object.assign(existing, update);
            return existing;
          }

          const created = {
            userId: create.userId,
            workspaceId: create.workspaceId,
            sortOrder: create.sortOrder,
          };
          userWorkspacePreferences.push(created);
          return created;
        },
      ),
    },
  };

  return {
    ...delegates,
    $transaction: jest.fn(
      async (callback: (tx: typeof delegates) => Promise<unknown>) => callback(delegates),
    ),
  } as unknown as PrismaService;
}

describe('Workspace invitation flow integration', () => {
  let app: INestApplication;
  let appModule: { AppModule: unknown };
  const prismaMock = createPrismaMock();
  const verificationTokensByEmail: Record<string, string> = {};
  const emailProviderMock: EmailProvider = {
    sendVerificationEmail: jest.fn(async ({ to, token }) => {
      verificationTokensByEmail[to.toLowerCase()] = token;
    }),
  };

  const password = 'strong-password';

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

  async function registerAndVerify(email: string): Promise<string> {
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
    return registerResponse.body.id as string;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({
      email,
      password,
    });

    expect(response.status).toBe(201);
    return response.body.accessToken as string;
  }

  it('supports create/list/invite/accept and blocks non-visible users', async () => {
    const adminEmail = 'admin-1@example.com';
    const inviteeEmail = 'invitee-1@example.com';
    const outsiderEmail = 'outsider-1@example.com';

    await registerAndVerify(adminEmail);
    await registerAndVerify(inviteeEmail);
    await registerAndVerify(outsiderEmail);

    const adminToken = await login(adminEmail);
    const inviteeToken = await login(inviteeEmail);
    const outsiderToken = await login(outsiderEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Engineering',
        timezone: 'Europe/Paris',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    expect(createWorkspaceResponse.body.membership).toEqual({
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    const workspaceId = createWorkspaceResponse.body.id as string;

    const inviteeListBeforeInvite = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${inviteeToken}`);
    expect(inviteeListBeforeInvite.status).toBe(200);
    expect(inviteeListBeforeInvite.body.items).toHaveLength(0);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: inviteeEmail,
      });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body.status).toBe('PENDING');

    const invitationId = inviteResponse.body.id as string;

    const inviteeListAfterInvite = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${inviteeToken}`);

    expect(inviteeListAfterInvite.status).toBe(200);
    expect(inviteeListAfterInvite.body.items).toHaveLength(1);
    expect(inviteeListAfterInvite.body.items[0].id).toBe(workspaceId);
    expect(inviteeListAfterInvite.body.items[0].membership).toBeNull();
    expect(inviteeListAfterInvite.body.items[0].invitation).toMatchObject({
      id: invitationId,
      status: 'PENDING',
      email: inviteeEmail,
    });

    const outsiderList = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderList.status).toBe(200);
    expect(outsiderList.body.items).toHaveLength(0);

    const outsiderAcceptAttempt = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(outsiderAcceptAttempt.status).toBe(403);
    expect(outsiderAcceptAttempt.body).toEqual({
      code: 'WORKSPACE_NOT_VISIBLE',
      message: 'Workspace not visible',
    });

    const acceptResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${invitationId}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`);

    expect(acceptResponse.status).toBe(201);
    expect(acceptResponse.body).toEqual({ accepted: true });

    const inviteeListAfterAccept = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${inviteeToken}`);

    expect(inviteeListAfterAccept.status).toBe(200);
    expect(inviteeListAfterAccept.body.items).toHaveLength(1);
    expect(inviteeListAfterAccept.body.items[0].membership).toEqual({
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    expect(inviteeListAfterAccept.body.items[0].invitation).toBeNull();

    const memberInviteAttempt = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({
        email: 'someone-else@example.com',
      });

    expect(memberInviteAttempt.status).toBe(403);
    expect(memberInviteAttempt.body).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Only workspace admins can perform this action',
    });
  });

  it('supports invitation rejection and removes visibility', async () => {
    const adminEmail = 'admin-2@example.com';
    const rejecteeEmail = 'rejectee-2@example.com';

    await registerAndVerify(adminEmail);
    await registerAndVerify(rejecteeEmail);

    const adminToken = await login(adminEmail);
    const rejecteeToken = await login(rejecteeEmail);

    const createWorkspaceResponse = await request(app.getHttpServer())
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Finance',
      });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.id as string;

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: rejecteeEmail,
      });

    expect(inviteResponse.status).toBe(201);
    const invitationId = inviteResponse.body.id as string;

    const rejecteeListBeforeReject = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${rejecteeToken}`);
    expect(rejecteeListBeforeReject.status).toBe(200);
    expect(rejecteeListBeforeReject.body.items).toHaveLength(1);

    const rejectResponse = await request(app.getHttpServer())
      .post(`/api/workspaces/invitations/${invitationId}/reject`)
      .set('Authorization', `Bearer ${rejecteeToken}`);

    expect(rejectResponse.status).toBe(201);
    expect(rejectResponse.body).toEqual({ rejected: true });

    const rejecteeListAfterReject = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${rejecteeToken}`);

    expect(rejecteeListAfterReject.status).toBe(200);
    expect(rejecteeListAfterReject.body.items).toHaveLength(0);
  });

  it('enforces email verification gate for workspace access', async () => {
    const unverifiedEmail = 'unverified-3@example.com';
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        firstName: 'Unverified',
        lastName: 'User',
        email: unverifiedEmail,
        password,
      });

    expect(registerResponse.status).toBe(201);
    const userId = registerResponse.body.id as string;

    const jwtService = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
    });

    const forgedToken = await jwtService.signAsync(
      {
        sub: userId,
        email: unverifiedEmail,
        emailVerifiedAt: null,
        tokenType: 'access',
      },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      },
    );

    const response = await request(app.getHttpServer())
      .get('/api/workspaces')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Email must be verified before accessing workspaces',
    });
  });
});
