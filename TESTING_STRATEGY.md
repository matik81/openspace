# Testing Strategy

---

## Unit Tests

- AuthService
- WorkspaceService
- InvitationService
- BookingService

---

## Integration Tests

- Email verification flow
- Invitation accept flow
- Invitation reject flow
- Workspace visibility rules (active member or pending invitation only)
- Booking creation
- Booking overlap rejection

---

## Overlap Test Case

1. Create booking A (10:00 - 11:00)
2. Attempt booking B (10:30 - 11:30)
3. Expect conflict error BOOKING_OVERLAP

---

## CI

CI must run:

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- prisma migrate
- build
