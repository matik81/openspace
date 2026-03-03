# OpenSpace – Project Functional Specification

---

## 1. User Registration

Fields:
- firstName
- lastName
- email
- password

After registration:
- Send verification email
- Store emailVerifiedAt null
- If the email belongs to a logically deleted (`CANCELLED`) account, reactivate the same user record instead of creating a new one
- On reactivation, reset cancellation flags, clear sessions and require email verification again

Until verified:
- User cannot log in
- System blocks all access

Account management:
- Authenticated users can update firstName and lastName
- Authenticated users can change password
- Account update requires confirmation with current email and current password
- Account deletion remains available from the account management modal
- Users can request a password reset token by email
- Users can reset password with token + new password

---

## 2. Workspaces

A user can create a workspace.

On creation:
- User becomes ADMIN
- Workspace stores timezone

Workspace attributes:
- id
- name
- timezone
- scheduleStartHour
- scheduleEndHour
- createdByUserId

Rules:
- Workspace name must be unique only among active (`ACTIVE`) workspaces
- Maximum 10 active workspaces per user
- Maximum 100 active rooms per workspace
- Maximum 1000 active members per workspace
- Maximum 1000 pending invitations per workspace
- Workspace deletion is logical (`CANCELLED`)
- Workspace schedule changes create a new effective schedule version

---

## 3. Invitations

Admin invites by email.

Invitation fields:
- workspaceId
- email
- tokenHash
- status (PENDING | ACCEPTED | REJECTED | EXPIRED | REVOKED)
- expiresAt

Workspace list behavior:

GET /workspaces returns:

- Active memberships
- Pending invitations (highlighted)

UI:
- Invitations appear visually distinct
- Buttons: Accept / Reject

---

## 4. Rooms

Admin can create:
- name
- description

Room names must be unique within a workspace among active (`ACTIVE`) rooms.

Rules:
- Room deletion is logical (`CANCELLED`)
- Future bookings on a deleted room become cancelled with reason `ROOM_UNAVAILABLE`

---

## 5. Bookings

Members can create bookings with:

- workspaceId
- roomId
- startAt
- endAt
- subject
- criticality (HIGH | MEDIUM | LOW)

Rules:
- No overlap per room
- Prevented via Postgres EXCLUDE constraint
- Stored as timestamptz
- Displayed in workspace timezone
- Maximum 1000 active future bookings per user in each workspace
- Booking date cannot be more than 365 days ahead
- Bookings before today cannot be changed or cancelled

Cancellation:
- Past bookings before today cannot be cancelled by the user
- Cancellation is logical with timestamp and reason
- Supported reasons: `USER_CANCELLED`, `USER_LEFT_WORKSPACE`, `ROOM_UNAVAILABLE`, `SCHEDULE_INCOMPATIBLE`

Operational limits:

- Maximum 10 registrations per hour per IP
- Maximum 5 workspace creations per hour per user
- Maximum 50 room creations per hour per user
- Maximum 50 invitation creations per hour per user
- Maximum 50 booking creations per hour per user
- Reaching the rate limit suspends the IP/user for 24 hours

---

## 6. Future Extensions

- Promote other admins
- Configure room availability schedule
- Configure usage limits per user
- Show available rooms for a specific date
- Multi-language support (EN, IT, FR, DE, ES)

Frontend must be ready for i18n.
