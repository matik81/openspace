CREATE TABLE "PasswordResetToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken" ("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx"
  ON "PasswordResetToken" ("userId", "expiresAt");
CREATE INDEX "PasswordResetToken_expiresAt_consumedAt_idx"
  ON "PasswordResetToken" ("expiresAt", "consumedAt");
