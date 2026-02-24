ALTER TABLE "Booking"
  DROP CONSTRAINT IF EXISTS "Booking_active_user_overlap_exclusion";

DROP INDEX IF EXISTS "Booking_active_user_overlap_idx";

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_active_user_overlap_exclusion"
  EXCLUDE USING gist (
    "workspaceId" WITH =,
    "createdByUserId" WITH =,
    "timeRange" WITH &&
  )
  WHERE ("status" = 'ACTIVE');

CREATE INDEX "Booking_active_user_overlap_idx"
  ON "Booking"
  USING gist ("workspaceId", "createdByUserId", "timeRange")
  WHERE ("status" = 'ACTIVE');
