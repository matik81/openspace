# Testing Strategy

---

## Unit Tests

- AuthService
- WorkspaceService
- InvitationService
- BookingService
- Auth account reactivation
- Auth password reset token lifecycle
- Auth account update confirmation

---

## Integration Tests

- Email verification flow
- Cancelled account reactivation on register
- Account update flow
- Password reset request flow
- Password reset confirmation flow
- Invitation accept flow
- Invitation reject flow
- Workspace visibility rules (active member or pending invitation only)
- Workspace leave flow with future booking cancellation
- Account deletion flow with logical cancellation propagation
- Booking creation
- Booking overlap rejection
- User double-booking rejection (same workspace)
- Cross-workspace overlapping bookings allowed
- Booking hours window enforcement based on workspace schedule settings
- Booking time increment enforcement (15-minute workspace time)
- Booking soft-cancel behavior and past-mutation guard
- Workspace schedule change cancellation for incompatible future bookings
- Rate-limit suspension responses

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
- prisma migrate deploy
- build

Notes:

- Prisma integration tests require the local Postgres instance to be running.
- Mocked integration suites should stub `OperationLimitsService` unless they explicitly cover suspensions.
