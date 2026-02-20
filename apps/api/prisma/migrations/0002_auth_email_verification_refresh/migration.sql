ALTER TABLE "User"
  ADD COLUMN "refreshTokenHash" TEXT,
  ADD COLUMN "refreshTokenExpiresAt" TIMESTAMPTZ(6);

CREATE TABLE "EmailVerificationToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx"
  ON "EmailVerificationToken" ("userId", "expiresAt");

CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_idx"
  ON "EmailVerificationToken" ("expiresAt", "consumedAt");

