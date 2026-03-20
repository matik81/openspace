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
    formerMember: {
      id: '88888888-8888-4888-8888-888888888888',
      firstName: 'Katherine',
      lastName: 'Johnson',
      email: 'playwright.former@example.com',
    },
  },
  workspaces: {
    admin: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Playwright HQ',
      slug: 'playwright.hq',
    },
    managed: {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Managed Ops',
      slug: 'managed-ops',
    },
    pending: {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Playwright Invite',
      slug: 'playwright-invite',
    },
  },
  rooms: {
    focus: {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Focus Room',
    },
    board: {
      id: '12121212-1212-4121-8121-121212121212',
      name: 'Board Room',
    },
    ops: {
      id: '13131313-1313-4131-8131-131313131313',
      name: 'Ops Room',
    },
  },
  bookings: {
    existing: {
      id: '66666666-6666-4666-8666-666666666666',
      subject: 'Seeded Review',
    },
    planning: {
      id: '14141414-1414-4141-8141-141414141414',
      subject: 'Planning Sync',
    },
    managedOps: {
      id: '15151515-1515-4151-8151-151515151515',
      subject: 'Managed Ops Standup',
    },
  },
  invitations: {
    pending: {
      id: '77777777-7777-4777-8777-777777777777',
    },
  },
  timezone: 'Europe/Rome',
};

const MANUAL_SCENARIO = {
  users: {
    linus: {
      id: '10101010-1010-4101-8101-101010101010',
      firstName: 'Linus',
      lastName: 'Torvalds',
      email: 'linus.owner@example.com',
    },
    margaret: {
      id: '20202020-2020-4202-8202-202020202020',
      firstName: 'Margaret',
      lastName: 'Hamilton',
      email: 'margaret.owner@example.com',
    },
    barbara: {
      id: '30303030-3030-4303-8303-303030303030',
      firstName: 'Barbara',
      lastName: 'Liskov',
      email: 'barbara.owner@example.com',
    },
    donald: {
      id: '40404040-4040-4404-8404-404040404040',
      firstName: 'Donald',
      lastName: 'Knuth',
      email: 'donald.admin@example.com',
    },
    tim: {
      id: '50505050-5050-4505-8505-505050505050',
      firstName: 'Tim',
      lastName: 'Berners-Lee',
      email: 'tim.member@example.com',
    },
    ken: {
      id: '60606060-6060-4606-8606-606060606060',
      firstName: 'Ken',
      lastName: 'Thompson',
      email: 'ken.member@example.com',
    },
    leslie: {
      id: '70707070-7070-4707-8707-707070707070',
      firstName: 'Leslie',
      lastName: 'Lamport',
      email: 'leslie.member@example.com',
    },
    joan: {
      id: '81818181-8181-4818-8818-818181818181',
      firstName: 'Joan',
      lastName: 'Clarke',
      email: 'joan.member@example.com',
    },
    edsger: {
      id: '91919191-9191-4919-8919-919191919191',
      firstName: 'Edsger',
      lastName: 'Dijkstra',
      email: 'edsger.member@example.com',
    },
    hedy: {
      id: '12341234-1234-4123-8123-123412341234',
      firstName: 'Hedy',
      lastName: 'Lamarr',
      email: 'hedy.left@example.com',
    },
    radia: {
      id: '23232323-2323-4232-8232-232323232323',
      firstName: 'Radia',
      lastName: 'Perlman',
      email: 'radia.left@example.com',
    },
    james: {
      id: '24242424-2424-4242-8242-242424242424',
      firstName: 'James',
      lastName: 'Gosling',
      email: 'james.invited@example.com',
    },
    frances: {
      id: '25252525-2525-4252-8252-252525252525',
      firstName: 'Frances',
      lastName: 'Allen',
      email: 'frances.invited@example.com',
    },
    dennis: {
      id: '26262626-2626-4262-8262-262626262626',
      firstName: 'Dennis',
      lastName: 'Ritchie',
      email: 'dennis.invited@example.com',
    },
    sophie: {
      id: '27272727-2727-4272-8272-272727272727',
      firstName: 'Sophie',
      lastName: 'Wilson',
      email: 'sophie.admin@example.com',
    },
    guido: {
      id: '28282828-2828-4282-8282-282828282828',
      firstName: 'Guido',
      lastName: 'van Rossum',
      email: 'guido.member@example.com',
    },
    annie: {
      id: '29292929-2929-4292-8292-292929292929',
      firstName: 'Annie',
      lastName: 'Easley',
      email: 'annie.unverified@example.com',
      verified: false,
    },
    brenda: {
      id: '34343434-3434-4343-8343-343434343434',
      firstName: 'Brenda',
      lastName: 'Romero',
      email: 'brenda.cancelled@example.com',
      status: 'CANCELLED',
    },
    noel: {
      id: '35353535-3535-4353-8353-353535353535',
      firstName: 'Noel',
      lastName: 'Welch',
      email: 'noel.left@example.com',
    },
    mary: {
      id: '36363636-3636-4363-8363-363636363636',
      firstName: 'Mary',
      lastName: 'Jackson',
      email: 'mary.empty@example.com',
    },
  },
  workspaces: {
    nordic: {
      id: '46464646-4646-4464-8464-464646464646',
      name: 'Nordic Lab',
      slug: 'nordic-lab',
      timezone: 'Europe/Rome',
      scheduleStartHour: 7,
      scheduleEndHour: 19,
    },
    quiet: {
      id: '47474747-4747-4474-8474-474747474747',
      name: 'Quiet Corner',
      slug: 'quiet-corner',
      timezone: 'Europe/Rome',
      scheduleStartHour: 9,
      scheduleEndHour: 17,
    },
    archive: {
      id: '48484848-4848-4484-8484-484848484848',
      name: 'Archive Annex',
      slug: 'archive-annex',
      timezone: 'Europe/Rome',
      scheduleStartHour: 8,
      scheduleEndHour: 20,
    },
  },
  rooms: {
    kernel: {
      id: '56565656-5656-4565-8565-565656565656',
      name: 'Kernel Room',
      description: 'Owner plus delegated-admin workspace for richer manual checks',
    },
    booth: {
      id: '57575757-5757-4575-8575-575757575757',
      name: 'Focus Booth',
      description: 'Smaller workspace for active and former member visibility checks',
    },
    records: {
      id: '58585858-5858-4585-8585-585858585858',
      name: 'Records Room',
      description: 'Archive-oriented room with owner, admin, member, and invitation coverage',
    },
  },
  bookings: {
    kernelReview: {
      id: '59595959-5959-4595-8595-595959595959',
      subject: 'Kernel Review',
    },
    quietPairing: {
      id: '61616161-6161-4616-8616-616161616161',
      subject: 'Quiet Pairing',
    },
    archiveIntake: {
      id: '62626262-6262-4626-8626-626262626262',
      subject: 'Archive Intake',
    },
  },
  invitations: {
    archivePending: {
      id: '63636363-6363-4636-8636-636363636363',
      email: 'james.invited@example.com',
    },
    nordicPending: {
      id: '64646464-6464-4646-8646-646464646464',
      email: 'frances.invited@example.com',
    },
    quietPending: {
      id: '65656565-6565-4656-8656-656565656565',
      email: 'dennis.invited@example.com',
    },
    archiveRevoked: {
      id: '67676767-6767-4676-8676-676767676767',
      email: 'guest.revoked@example.com',
    },
    quietExpired: {
      id: '68686868-6868-4686-8686-686868686868',
      email: 'guest.expired@example.com',
    },
  },
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const schema = new URL(connectionString).searchParams.get('schema') ?? undefined;
const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
const prisma = new PrismaClient({ adapter });

function resolveSchemaName() {
  const match = /(?:\?|&)schema=([^&]+)/.exec(process.env.DATABASE_URL ?? '');
  return match?.[1] ?? 'public';
}

function getZonedDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10),
    second: Number.parseInt(parts.second, 10),
  };
}

function createUtcDateForLocalTime(localDate, timeZone, hour, minute) {
  const [year, month, day] = localDate.split('-').map((value) => Number.parseInt(value, 10));
  const desiredUtcValue = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcGuess = desiredUtcValue;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zonedParts = getZonedDateParts(new Date(utcGuess), timeZone);
    const zonedUtcValue = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    );
    const diff = desiredUtcValue - zonedUtcValue;

    if (diff === 0) {
      break;
    }

    utcGuess += diff;
  }

  return new Date(utcGuess);
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

  const sharedPasswordHash = await hash(FULLSTACK_E2E.credentials.password, 12);
  const invitationExpiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiredInvitationExpiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const seededUsers = [
    {
      ...FULLSTACK_E2E.users.admin,
    },
    {
      ...FULLSTACK_E2E.users.inviter,
    },
    {
      ...FULLSTACK_E2E.users.formerMember,
    },
    ...Object.values(MANUAL_SCENARIO.users),
  ].map((user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    passwordHash: sharedPasswordHash,
    status: user.status ?? 'ACTIVE',
    cancelledAt: user.status === 'CANCELLED' ? now : null,
    emailVerifiedAt: user.verified === false ? null : now,
  }));

  await prisma.user.createMany({
    data: seededUsers,
  });

  await prisma.workspace.createMany({
    data: [
      {
        id: FULLSTACK_E2E.workspaces.admin.id,
        name: FULLSTACK_E2E.workspaces.admin.name,
        slug: FULLSTACK_E2E.workspaces.admin.slug,
        timezone: FULLSTACK_E2E.timezone,
        scheduleStartHour: 8,
        scheduleEndHour: 18,
        createdByUserId: FULLSTACK_E2E.users.admin.id,
      },
      {
        id: FULLSTACK_E2E.workspaces.pending.id,
        name: FULLSTACK_E2E.workspaces.pending.name,
        slug: FULLSTACK_E2E.workspaces.pending.slug,
        timezone: FULLSTACK_E2E.timezone,
        scheduleStartHour: 8,
        scheduleEndHour: 18,
        createdByUserId: FULLSTACK_E2E.users.inviter.id,
      },
      {
        id: FULLSTACK_E2E.workspaces.managed.id,
        name: FULLSTACK_E2E.workspaces.managed.name,
        slug: FULLSTACK_E2E.workspaces.managed.slug,
        timezone: FULLSTACK_E2E.timezone,
        scheduleStartHour: 8,
        scheduleEndHour: 18,
        createdByUserId: FULLSTACK_E2E.users.inviter.id,
      },
      {
        id: MANUAL_SCENARIO.workspaces.nordic.id,
        name: MANUAL_SCENARIO.workspaces.nordic.name,
        slug: MANUAL_SCENARIO.workspaces.nordic.slug,
        timezone: MANUAL_SCENARIO.workspaces.nordic.timezone,
        scheduleStartHour: MANUAL_SCENARIO.workspaces.nordic.scheduleStartHour,
        scheduleEndHour: MANUAL_SCENARIO.workspaces.nordic.scheduleEndHour,
        createdByUserId: MANUAL_SCENARIO.users.linus.id,
      },
      {
        id: MANUAL_SCENARIO.workspaces.quiet.id,
        name: MANUAL_SCENARIO.workspaces.quiet.name,
        slug: MANUAL_SCENARIO.workspaces.quiet.slug,
        timezone: MANUAL_SCENARIO.workspaces.quiet.timezone,
        scheduleStartHour: MANUAL_SCENARIO.workspaces.quiet.scheduleStartHour,
        scheduleEndHour: MANUAL_SCENARIO.workspaces.quiet.scheduleEndHour,
        createdByUserId: MANUAL_SCENARIO.users.margaret.id,
      },
      {
        id: MANUAL_SCENARIO.workspaces.archive.id,
        name: MANUAL_SCENARIO.workspaces.archive.name,
        slug: MANUAL_SCENARIO.workspaces.archive.slug,
        timezone: MANUAL_SCENARIO.workspaces.archive.timezone,
        scheduleStartHour: MANUAL_SCENARIO.workspaces.archive.scheduleStartHour,
        scheduleEndHour: MANUAL_SCENARIO.workspaces.archive.scheduleEndHour,
        createdByUserId: MANUAL_SCENARIO.users.barbara.id,
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
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: FULLSTACK_E2E.users.inviter.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        userId: FULLSTACK_E2E.users.inviter.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        userId: FULLSTACK_E2E.users.admin.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        userId: FULLSTACK_E2E.users.formerMember.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: FULLSTACK_E2E.users.formerMember.id,
        role: 'MEMBER',
        status: 'INACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: MANUAL_SCENARIO.users.tim.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: MANUAL_SCENARIO.users.ken.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        userId: MANUAL_SCENARIO.users.leslie.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        userId: MANUAL_SCENARIO.users.leslie.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        userId: MANUAL_SCENARIO.users.radia.id,
        role: 'MEMBER',
        status: 'INACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        userId: MANUAL_SCENARIO.users.linus.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        userId: MANUAL_SCENARIO.users.donald.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        userId: MANUAL_SCENARIO.users.joan.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        userId: MANUAL_SCENARIO.users.noel.id,
        role: 'MEMBER',
        status: 'INACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        userId: MANUAL_SCENARIO.users.margaret.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        userId: MANUAL_SCENARIO.users.edsger.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        userId: MANUAL_SCENARIO.users.hedy.id,
        role: 'MEMBER',
        status: 'INACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        userId: MANUAL_SCENARIO.users.barbara.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        userId: MANUAL_SCENARIO.users.sophie.id,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        userId: MANUAL_SCENARIO.users.guido.id,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    ],
  });

  await prisma.room.createMany({
    data: [
      {
        id: FULLSTACK_E2E.rooms.focus.id,
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        name: FULLSTACK_E2E.rooms.focus.name,
        description: 'Seeded room for Playwright full-stack tests',
      },
      {
        id: FULLSTACK_E2E.rooms.board.id,
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        name: FULLSTACK_E2E.rooms.board.name,
        description: 'Secondary seeded room for manual frontend testing',
      },
      {
        id: FULLSTACK_E2E.rooms.ops.id,
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        name: FULLSTACK_E2E.rooms.ops.name,
        description: 'Managed workspace room for delegated admin checks',
      },
      {
        id: MANUAL_SCENARIO.rooms.kernel.id,
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        name: MANUAL_SCENARIO.rooms.kernel.name,
        description: MANUAL_SCENARIO.rooms.kernel.description,
      },
      {
        id: MANUAL_SCENARIO.rooms.booth.id,
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        name: MANUAL_SCENARIO.rooms.booth.name,
        description: MANUAL_SCENARIO.rooms.booth.description,
      },
      {
        id: MANUAL_SCENARIO.rooms.records.id,
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        name: MANUAL_SCENARIO.rooms.records.name,
        description: MANUAL_SCENARIO.rooms.records.description,
      },
    ],
  });

  await prisma.booking.createMany({
    data: [
      {
        id: FULLSTACK_E2E.bookings.existing.id,
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        roomId: FULLSTACK_E2E.rooms.focus.id,
        createdByUserId: FULLSTACK_E2E.users.admin.id,
        startAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 9, 0),
        endAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 10, 0),
        subject: FULLSTACK_E2E.bookings.existing.subject,
        criticality: 'MEDIUM',
      },
      {
        id: FULLSTACK_E2E.bookings.planning.id,
        workspaceId: FULLSTACK_E2E.workspaces.admin.id,
        roomId: FULLSTACK_E2E.rooms.board.id,
        createdByUserId: FULLSTACK_E2E.users.inviter.id,
        startAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 11, 0),
        endAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 12, 0),
        subject: FULLSTACK_E2E.bookings.planning.subject,
        criticality: 'HIGH',
      },
      {
        id: FULLSTACK_E2E.bookings.managedOps.id,
        workspaceId: FULLSTACK_E2E.workspaces.managed.id,
        roomId: FULLSTACK_E2E.rooms.ops.id,
        createdByUserId: FULLSTACK_E2E.users.admin.id,
        startAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 15, 0),
        endAt: createUtcDateForLocalTime(todayRome, FULLSTACK_E2E.timezone, 16, 0),
        subject: FULLSTACK_E2E.bookings.managedOps.subject,
        criticality: 'LOW',
      },
      {
        id: MANUAL_SCENARIO.bookings.kernelReview.id,
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        roomId: MANUAL_SCENARIO.rooms.kernel.id,
        createdByUserId: MANUAL_SCENARIO.users.donald.id,
        startAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.nordic.timezone,
          10,
          0,
        ),
        endAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.nordic.timezone,
          11,
          0,
        ),
        subject: MANUAL_SCENARIO.bookings.kernelReview.subject,
        criticality: 'HIGH',
      },
      {
        id: MANUAL_SCENARIO.bookings.quietPairing.id,
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        roomId: MANUAL_SCENARIO.rooms.booth.id,
        createdByUserId: MANUAL_SCENARIO.users.edsger.id,
        startAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.quiet.timezone,
          13,
          0,
        ),
        endAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.quiet.timezone,
          14,
          0,
        ),
        subject: MANUAL_SCENARIO.bookings.quietPairing.subject,
        criticality: 'MEDIUM',
      },
      {
        id: MANUAL_SCENARIO.bookings.archiveIntake.id,
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        roomId: MANUAL_SCENARIO.rooms.records.id,
        createdByUserId: MANUAL_SCENARIO.users.barbara.id,
        startAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.archive.timezone,
          16,
          0,
        ),
        endAt: createUtcDateForLocalTime(
          todayRome,
          MANUAL_SCENARIO.workspaces.archive.timezone,
          17,
          0,
        ),
        subject: MANUAL_SCENARIO.bookings.archiveIntake.subject,
        criticality: 'LOW',
      },
    ],
  });

  await prisma.invitation.createMany({
    data: [
      {
        id: FULLSTACK_E2E.invitations.pending.id,
        workspaceId: FULLSTACK_E2E.workspaces.pending.id,
        email: FULLSTACK_E2E.users.admin.email,
        tokenHash: 'playwright-pending-token-hash',
        status: 'PENDING',
        expiresAt: invitationExpiresAt,
        invitedByUserId: FULLSTACK_E2E.users.inviter.id,
      },
      {
        id: MANUAL_SCENARIO.invitations.archivePending.id,
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        email: MANUAL_SCENARIO.invitations.archivePending.email,
        tokenHash: 'manual-archive-pending-token-hash',
        status: 'PENDING',
        expiresAt: invitationExpiresAt,
        invitedByUserId: MANUAL_SCENARIO.users.sophie.id,
      },
      {
        id: MANUAL_SCENARIO.invitations.nordicPending.id,
        workspaceId: MANUAL_SCENARIO.workspaces.nordic.id,
        email: MANUAL_SCENARIO.invitations.nordicPending.email,
        tokenHash: 'manual-nordic-pending-token-hash',
        status: 'PENDING',
        expiresAt: invitationExpiresAt,
        invitedByUserId: MANUAL_SCENARIO.users.donald.id,
      },
      {
        id: MANUAL_SCENARIO.invitations.quietPending.id,
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        email: MANUAL_SCENARIO.invitations.quietPending.email,
        tokenHash: 'manual-quiet-pending-token-hash',
        status: 'PENDING',
        expiresAt: invitationExpiresAt,
        invitedByUserId: MANUAL_SCENARIO.users.margaret.id,
      },
      {
        id: MANUAL_SCENARIO.invitations.archiveRevoked.id,
        workspaceId: MANUAL_SCENARIO.workspaces.archive.id,
        email: MANUAL_SCENARIO.invitations.archiveRevoked.email,
        tokenHash: 'manual-archive-revoked-token-hash',
        status: 'REVOKED',
        expiresAt: invitationExpiresAt,
        invitedByUserId: MANUAL_SCENARIO.users.barbara.id,
      },
      {
        id: MANUAL_SCENARIO.invitations.quietExpired.id,
        workspaceId: MANUAL_SCENARIO.workspaces.quiet.id,
        email: MANUAL_SCENARIO.invitations.quietExpired.email,
        tokenHash: 'manual-quiet-expired-token-hash',
        status: 'EXPIRED',
        expiresAt: expiredInvitationExpiresAt,
        invitedByUserId: MANUAL_SCENARIO.users.margaret.id,
      },
    ],
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
