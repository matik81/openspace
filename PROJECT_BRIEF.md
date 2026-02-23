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

Until verified:
- User cannot log in
- System blocks all access

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
- createdByUserId

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

Unique name per workspace.

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

Cancellation:
- Allowed for past, same-day, and future reservations
- Hard delete reservation record on cancellation

---

## 6. Future Extensions

- Promote other admins
- Configure room availability schedule
- Configure usage limits per user
- Show available rooms for a specific date
- Multi-language support (EN, IT, FR, DE, ES)

Frontend must be ready for i18n.
