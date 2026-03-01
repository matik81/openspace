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
- User double-booking rejection (same workspace)
- Cross-workspace overlapping bookings allowed
- Booking hours window enforcement based on workspace schedule settings
- Booking time increment enforcement (15-minute workspace time)

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

## Cross-Workspace User Booking Test Case

1. Create workspace A and workspace B
2. Create overlapping bookings for the same user, one in each workspace
3. Expect both bookings to succeed

---

## Booking Hours Test Case

1. Configure a workspace schedule window
2. Attempt booking before the configured local start hour
3. Attempt booking ending after the configured local end hour
4. Expect BOOKING_OUTSIDE_ALLOWED_HOURS

---

## CI

CI must run:

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- prisma migrate
- build
