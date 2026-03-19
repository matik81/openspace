# OpenSpace - Project Functional Specification

## 1. User Registration and Authentication

Registration fields:

- `firstName`
- `lastName`
- `email`
- `password`

After registration:

- the system creates or reactivates the user account
- `emailVerifiedAt` remains `null` until verification unless registration is completed with a valid invitation token
- a verification token is issued unless registration is completed with a valid invitation token
- login remains blocked until email verification succeeds

Repeated registration rules:

- if the email belongs to an active verified user, registration is rejected
- if the email belongs to an active unverified user, the same user record is updated and a new verification token is issued
- if registration is completed with a valid invitation token, the invited email is verified immediately
- previous unconsumed verification tokens for that user are invalidated when registration restarts

Reactivation rules:

- if the email belongs to a logically cancelled user, the same user record is reactivated
- cancellation flags are cleared
- existing refresh session data is cleared
- email verification is required again

Account management:

- authenticated users can update `firstName` and `lastName`
- authenticated users can change password
- changing password requires the current password
- authenticated users can delete their account from the account management modal
- users can request a password reset token by email
- users can reset password with token and new password

Session rules:

- access tokens are short-lived
- refresh tokens are persisted server-side
- logout revokes the stored refresh token
- the web frontend refreshes expired access tokens through its proxy routes
- unverified users are blocked from workspace access even if a token is forged without `emailVerifiedAt`

Current implementation note:

- email delivery uses the `console` provider by default in development and test
- the repository also includes a `resend` provider path for production-oriented deployments

## 2. Workspaces

A user can create a workspace.

On creation:

- the creator becomes `ADMIN`
- the workspace stores timezone and schedule configuration

Workspace attributes:

- `id`
- `name`
- `timezone`
- `scheduleStartHour`
- `scheduleEndHour`
- `createdByUserId`

Rules:

- workspace display names can be non-unique
- workspace web-address slugs must be unique only among active workspaces
- a user can own or participate in at most 10 active workspaces by default
- visible workspace lists respect persisted per-user ordering when preferences exist
- a workspace can contain at most 100 active rooms by default
- a workspace can contain at most 1000 active members by default
- a workspace can contain at most 1000 pending invitations by default
- workspace cancellation is logical and sets `status=CANCELLED`
- workspace schedule changes create a new effective schedule version

## 3. Invitations and Visibility

Admins invite users by email.

Invitation onboarding rules:

- if the invited email does not already belong to an active verified account, OpenSpace sends an invitation-registration email
- the email explains that the user was invited to a specific workspace by a specific inviter
- the email briefly describes OpenSpace as a meeting-room booking tool
- the email carries a direct invitation registration link and token
- registration with a valid invitation token verifies the invited email immediately
- the workspace invitation itself remains pending until the authenticated verified user accepts or rejects it

Invitation fields:

- `workspaceId`
- `email`
- `tokenHash`
- `status`
- `expiresAt`

Invitation statuses:

- `PENDING`
- `ACCEPTED`
- `REJECTED`
- `EXPIRED`
- `REVOKED`

Workspace visibility rules:

- `GET /workspaces` returns workspaces where the user is an active member
- `GET /workspaces` also returns workspaces where the user has a pending invitation for their authenticated email
- no public workspace listing exists

UI expectations:

- pending invitations are visually distinct
- the user can accept or reject them directly
- admin views expose summary data, members, and pending invitations separately

## 4. Rooms

Admins can create rooms with:

- `name`
- `description`

Rules:

- room names must be unique within the same workspace among active rooms only
- room cancellation is logical and sets `status=CANCELLED`
- future bookings on a cancelled room are logically cancelled with reason `ROOM_UNAVAILABLE`
- historical bookings are preserved

## 5. Bookings

Members can create bookings with:

- `workspaceId`
- `roomId`
- `startAt`
- `endAt`
- `subject`
- `criticality`

Criticality values:

- `HIGH`
- `MEDIUM`
- `LOW`

Rules:

- no overlap is allowed for active bookings in the same room
- no overlap is allowed for active bookings by the same user within the same workspace
- overlapping bookings by the same user in different workspaces are allowed
- bookings are stored as UTC timestamps
- bookings are evaluated and displayed in the workspace timezone
- bookings must start and end on the same local workspace date
- bookings must respect the workspace schedule window
- bookings must align to 15-minute increments
- a user can have at most 1000 active future bookings per workspace by default
- bookings cannot be created more than 365 days in advance by default
- bookings before the current workspace-local day cannot be changed

Cancellation:

- past bookings before the current workspace-local day cannot be cancelled by the user
- cancellation is logical and preserves the record
- supported cancellation reasons are:
  - `USER_CANCELLED`
  - `USER_LEFT_WORKSPACE`
  - `ROOM_UNAVAILABLE`
  - `SCHEDULE_INCOMPATIBLE`

## 6. Operational Limits

Configured default limits:

- maximum 50 registrations per hour per IP
- maximum 50 workspace creations per hour per user
- maximum 50 room creations per hour per user
- maximum 50 invitation creations per hour per user
- maximum 50 booking creations per hour per user

Suspension behavior:

- exceeding a limit suspends the IP or user for 24 hours
- forwarded IP headers are trusted only when the request comes from configured trusted proxies

## 7. Current Frontend Scope

Implemented frontend flows:

- public auth pages and modal states for login, registration, invitation registration, email verification, and password reset
- dashboard for workspace visibility, invitation actions, and pending invitation surfacing
- workspace shell for booking management, room filtering, and top-bar workspace switching
- admin pages for workspace settings, invitations, member list, room management, and destructive confirmations
- account settings modal for profile update, password change, and account deletion

## 8. Future Extensions

- promote other admins
- configure room-level availability schedules
- configure per-user usage limits
- expand route-handler and contract-level frontend coverage
- add automated tests for `packages/shared`
- add explicit i18n framework and translations
