DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Booking_active_user_overlap_exclusion'
      AND conrelid = '"Booking"'::regclass
  ) THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT "Booking_active_user_overlap_exclusion"
      EXCLUDE USING gist (
        "createdByUserId" WITH =,
        "timeRange" WITH &&
      )
      WHERE ("status" = 'ACTIVE');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Booking_active_user_overlap_idx"
  ON "Booking"
  USING gist ("createdByUserId", "timeRange")
  WHERE ("status" = 'ACTIVE');
