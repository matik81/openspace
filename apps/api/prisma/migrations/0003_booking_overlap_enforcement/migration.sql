CREATE EXTENSION IF NOT EXISTS "btree_gist";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Booking'
      AND column_name = 'timeRange'
  ) THEN
    ALTER TABLE "Booking"
      ADD COLUMN "timeRange" tstzrange
      GENERATED ALWAYS AS (tstzrange("startAt", "endAt", '[)')) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Booking_active_overlap_exclusion'
      AND conrelid = '"Booking"'::regclass
  ) THEN
    ALTER TABLE "Booking"
      ADD CONSTRAINT "Booking_active_overlap_exclusion"
      EXCLUDE USING gist (
        "roomId" WITH =,
        "timeRange" WITH &&
      )
      WHERE ("status" = 'ACTIVE');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Booking_active_overlap_idx"
  ON "Booking"
  USING gist ("roomId", "timeRange")
  WHERE ("status" = 'ACTIVE');
