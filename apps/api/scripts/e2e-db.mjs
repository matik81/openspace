import { PrismaPg } from '@prisma/adapter-pg';
import bcryptjs from 'bcryptjs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const { hash } = bcryptjs;
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../src/generated/prisma');

const FULLSTACK_E2E = {
  credentials: {
    email: 'playwright.admin@example.com',
    password: 'Password123!',
  },
  users: {
    admin: {
      id: '11111111-1111-4111-8111-111111111111',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'playwright.admin@example.com',
    },
    inviter: {
      id: '22222222-2222-4222-8222-222222222222',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'playwright.inviter@example.com',
    },
  },
  workspaces: {
    admin: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Playwright HQ',
    },
    pending: {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Playwright Invite',
    },
  },
  rooms: {
    focus: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Focus Room',
    },
  },
  bookings: {
    existing: {
      id: '66666666-6666-4666-8666-666666666666',
      subject: 'Seeded Review',
    },
  },
  invitations: {
    pending: {
      id: '77777777-7777-4777-8777-777777777777',
    },
  },
  timezone: 'Europe/Rome',
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function resolveSchemaName() {
  const match = /(?:\?|&)schema=([^&]+)/.exec(process.env.DATABASE_URL ?? '');
  return match?.[1] ?? 'public';
}

export async function resetE2EDatabase() {
  const schema = resolveSchemaName();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "${schema}"."PasswordResetToken",
      "${schema}"."EmailVerificationToken",
      "${schema}"."RateLimitSuspension",
      "${schema}"."OperationLog",
      "${schema}"."WorkspaceScheduleVersion",
      "${schema}"."Booking",
      "${schema}"."Room",
      "${schema}"."Invitation",
      "${schema}"."WorkspaceMember",
      "${schema}"."UserWorkspacePreference",
      "${schema}"."Workspace",
      "${schema}"."User"
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedFullStackScenario() {
  const now = new Date();
  const todayRome = new Intl.DateTimeFormat('en-CA', {
    timeZone: FULLSTACK_E2E.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const adminPasswordHash = await hash(FULLSTACK_E2E.credentials.password, 12);
  const inviterPasswordHash = await hash('Password123!', 12);
  const invitationExpiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  await prisma.user.createMany({
    data: [
      {
        id: FULLSTACK_E2E.users.admin.id,
        firstName: FULLSTACK_E2E.users.admin.firstName,
        lastName: FULLSTACK_E2E.users.admin.lastName,
        email: FULLSTACK_E2E.users.admin.email,
        passwordHash: adminPasswordHash,
        emailVerifiedAt: now,
      },
      {
        id: FULLSTACK_E2E.users.inviter.id,
        firstName: FULLSTACK_E2E.users.inviter.firstName,
        lastName: FULLSTACK_E2E.users.inviter.lastName,
        email: FULLSTACK_E2E.users.inviter.email,
        passwordHash: inviterPasswordHash,
        emailVerifiedAt: now,
      },
    ],
  });

  await prisma.workspace.createMany({
    data: [
      {
        id: FULLSTACK_E2E.workspaces.admin.id,
        name: FULLSTACK_E2E.workspaces.admin.name,
        timezone: FULLSTACK_E2E.timezone,
        scheduleStartHour: 8,
        scheduleEndHour: 18,
        createdByUserId: FULLSTACK_E2E.users.admin.id,
      },
      {
        id: FULLSTACK_E2E.workspaces.pending.id,
        name: FULLSTACK_E2E.workspaces.pending.name,
        timezone: FULLSTACK_E2E.timezone,
        scheduleStartHour: 8,
        scheduleEndHour: 18,
        createdByUserId: FULLSTACK_E2E.users.inviter.id,
      },
    ],
  });

  await prisma.workspaceMember.createMany({
    data: [
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: FULLSTACK_E2E.users.admin.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.pending.id,
        userId: FULLSTACK_E2E.users.inviter.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    ],
  });

  await prisma.room.create({
    data: {
      id: FULLSTACK_E2E.rooms.focus.id,
      workspaceId: FULLSTACK_E2E.workspaces.admin.id,
      name: FULLSTACK_E2E.rooms.focus.name,
      description: 'Seeded room for Playwright full-stack tests',
    },
  });

  await prisma.booking.create({
    data: {
      id: FULLSTACK_E2E.bookings.existing.id,
      workspaceId: FULLSTACK_E2E.workspaces.admin.id,
      roomId: FULLSTACK_E2E.rooms.focus.id,
      createdByUserId: FULLSTACK_E2E.users.admin.id,
      startAt: new Date(`${todayRome}T09:00:00+01:00`),
      endAt: new Date(`${todayRome}T10:00:00+01:00`),
      subject: FULLSTACK_E2E.bookings.existing.subject,
      criticality: 'MEDIUM',
    },
  });

  await prisma.invitation.create({
    data: {
      id: FULLSTACK_E2E.invitations.pending.id,
      workspaceId: FULLSTACK_E2E.workspaces.pending.id,
      email: FULLSTACK_E2E.users.admin.email,
      tokenHash: 'playwright-pending-token-hash',
      status: 'PENDING',
      expiresAt: invitationExpiresAt,
      invitedByUserId: FULLSTACK_E2E.users.inviter.id,
    },
  });
}

export async function resetAndSeedFullStackScenario() {
  await resetE2EDatabase();
  await seedFullStackScenario();
}

export async function disconnectE2EDatabase() {
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] ?? 'reset-and-seed';

  try {
    if (command === 'reset') {
      await resetE2EDatabase();
    } else if (command === 'seed') {
      await seedFullStackScenario();
    } else {
      await resetAndSeedFullStackScenario();
    }
  } finally {
    await disconnectE2EDatabase();
  }
}
