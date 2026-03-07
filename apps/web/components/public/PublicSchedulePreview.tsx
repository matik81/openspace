'use client';

import { DaySchedule } from '@/components/calendar/DaySchedule';
import {
  PUBLIC_PREVIEW_ROOMS,
  PUBLIC_SCHEDULE,
  PUBLIC_TIMEZONE,
} from '@/components/public/public-preview-data';
import type { BookingListItem } from '@/lib/types';

const EMPTY_EDITABLE_BOOKING_IDS = new Set<string>();
const EMPTY_OWNED_BOOKING_IDS = new Set<string>();

export function PublicSchedulePreview({
  selectedDateKey,
  bookings,
  onPrevDay,
  onNextDay,
  onToday,
}: {
  selectedDateKey: string;
  bookings: BookingListItem[];
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}) {
  return (
    <DaySchedule
      rooms={PUBLIC_PREVIEW_ROOMS}
      bookings={bookings}
      timezone={PUBLIC_TIMEZONE}
      schedule={PUBLIC_SCHEDULE}
      selectedDateKey={selectedDateKey}
      ownedBookingIds={EMPTY_OWNED_BOOKING_IDS}
      editableBookingIds={EMPTY_EDITABLE_BOOKING_IDS}
      selectedBookingId={null}
      isMutating={false}
      onPrevDay={onPrevDay}
      onNextDay={onNextDay}
      onToday={onToday}
      canCreateBookings={false}
      onCreateSlot={() => undefined}
      onOpenBooking={() => undefined}
      onUpdateBooking={async () => undefined}
      onInlineError={() => undefined}
    />
  );
}
