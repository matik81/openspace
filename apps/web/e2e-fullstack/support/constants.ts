export const FULLSTACK_E2E = {
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
} as const;
