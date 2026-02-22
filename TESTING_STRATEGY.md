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
- User double-booking rejection
- Booking hours window enforcement (07:00-22:00 workspace time)

---

## Overlap Test Case

1. Create booking A (10:00 - 11:00)
2. Attempt booking B (10:30 - 11:30)
3. Expect conflict error BOOKING_OVERLAP

---

## User Double-Booking Test Case

1. Create booking A in Room 1 (10:00 - 11:00)
2. Attempt booking B in Room 2 (10:30 - 11:30) by same user
3. Expect conflict error BOOKING_USER_OVERLAP

---

## Booking Hours Test Case

1. Attempt booking before 07:00 local workspace time
2. Attempt booking ending after 22:00 local workspace time
3. Expect BOOKING_OUTSIDE_ALLOWED_HOURS

---

## CI

CI must run:

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- prisma migrate
- build
