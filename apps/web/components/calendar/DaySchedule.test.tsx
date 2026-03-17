import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaySchedule } from '@/components/calendar/DaySchedule';
import type { BookingListItem, RoomItem } from '@/lib/types';

const ROOM: RoomItem = {
  id: 'room-1',
  workspaceId: 'workspace-1',
  name: 'Focus Room',
  description: null,
  status: 'ACTIVE',
  cancelledAt: null,
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
};

const SECOND_ROOM: RoomItem = {
  id: 'room-2',
  workspaceId: 'workspace-1',
  name: 'Board Room',
  description: null,
  status: 'ACTIVE',
  cancelledAt: null,
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
};

function createBooking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: 'booking-1',
    workspaceId: 'workspace-1',
    roomId: ROOM.id,
    roomName: ROOM.name,
    createdByUserId: 'user-1',
    createdByDisplayName: 'Ada Lovelace',
    startAt: '2026-03-18T09:00:00.000Z',
    endAt: '2026-03-18T10:00:00.000Z',
    subject: 'Personal booking',
    criticality: 'MEDIUM',
    status: 'ACTIVE',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

function renderSchedule({
  rooms = [ROOM],
  bookings = [],
  ownedBookingIds = new Set<string>(),
  editableBookingIds = new Set<string>(),
  draftPreview = null,
  onOpenBooking = vi.fn(),
}: {
  rooms?: RoomItem[];
  bookings?: BookingListItem[];
  ownedBookingIds?: ReadonlySet<string>;
  editableBookingIds?: ReadonlySet<string>;
  draftPreview?: ComponentProps<typeof DaySchedule>['draftPreview'];
  onOpenBooking?: (booking: BookingListItem) => void;
}) {
  render(
    <DaySchedule
      rooms={rooms}
      bookings={bookings}
      timezone="UTC"
      schedule={{ startHour: 8, endHour: 18 }}
      selectedDateKey="2026-03-18"
      ownedBookingIds={ownedBookingIds}
      editableBookingIds={editableBookingIds}
      selectedBookingId={null}
      isMutating={false}
      onPrevDay={vi.fn()}
      onNextDay={vi.fn()}
      onToday={vi.fn()}
      canCreateBookings
      draftPreview={draftPreview}
      onCreateSlot={vi.fn()}
      onOpenBooking={onOpenBooking}
      onUpdateBooking={vi.fn(async () => undefined)}
      onInlineError={vi.fn()}
    />,
  );
}

describe('DaySchedule', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps past personal bookings styled as personal while leaving them read-only', async () => {
    const booking = createBooking();
    const onOpenBooking = vi.fn();

    renderSchedule({
      bookings: [booking],
      ownedBookingIds: new Set([booking.id]),
      editableBookingIds: new Set(),
      onOpenBooking,
    });

    const user = userEvent.setup();
    const bookingBlock = screen.getByRole('button', { name: /Personal booking/i });

    expect(bookingBlock).toHaveClass('bg-amber-100');
    expect(bookingBlock).toHaveClass('border-amber-300');
    expect(bookingBlock).not.toHaveClass('cursor-grab');
    expect(screen.queryByLabelText('Resize start time')).not.toBeInTheDocument();

    await user.click(bookingBlock);

    expect(onOpenBooking).toHaveBeenCalledWith(booking);
  });

  it('renders compatible draft previews in green and conflicting ones in red', () => {
    const { rerender } = render(
      <DaySchedule
        rooms={[ROOM]}
        bookings={[]}
        timezone="UTC"
        schedule={{ startHour: 8, endHour: 18 }}
        selectedDateKey="2026-03-18"
        ownedBookingIds={new Set()}
        editableBookingIds={new Set()}
        selectedBookingId={null}
        isMutating={false}
        onPrevDay={vi.fn()}
        onNextDay={vi.fn()}
        onToday={vi.fn()}
        canCreateBookings
        draftPreview={{
          roomId: ROOM.id,
          startMinutes: 9 * 60,
          endMinutes: 10 * 60,
          title: 'New booking',
          subtitle: 'Ada Lovelace',
          hasConflict: false,
        }}
        onCreateSlot={vi.fn()}
        onOpenBooking={vi.fn()}
        onUpdateBooking={vi.fn(async () => undefined)}
        onInlineError={vi.fn()}
      />,
    );

    const okPreview = screen.getByRole('button', { name: /New booking/i });
    expect(okPreview).toHaveClass('bg-emerald-100/90');
    expect(okPreview).toHaveClass('border-emerald-400');

    rerender(
      <DaySchedule
        rooms={[ROOM]}
        bookings={[]}
        timezone="UTC"
        schedule={{ startHour: 8, endHour: 18 }}
        selectedDateKey="2026-03-18"
        ownedBookingIds={new Set()}
        editableBookingIds={new Set()}
        selectedBookingId={null}
        isMutating={false}
        onPrevDay={vi.fn()}
        onNextDay={vi.fn()}
        onToday={vi.fn()}
        canCreateBookings
        draftPreview={{
          roomId: ROOM.id,
          startMinutes: 9 * 60,
          endMinutes: 10 * 60,
          title: 'New booking',
          subtitle: 'Ada Lovelace',
          hasConflict: true,
        }}
        onCreateSlot={vi.fn()}
        onOpenBooking={vi.fn()}
        onUpdateBooking={vi.fn(async () => undefined)}
        onInlineError={vi.fn()}
      />,
    );

    const conflictPreview = screen.getByRole('button', { name: /New booking/i });
    expect(conflictPreview).toHaveClass('bg-rose-100/90');
    expect(conflictPreview).toHaveClass('border-rose-400');
  });

  it('toggles room visibility from the filter menu without persisting it', async () => {
    renderSchedule({ rooms: [ROOM, SECOND_ROOM] });

    const user = userEvent.setup();
    const filterButton = screen.getByRole('button', { name: /^Filter/ });

    expect(
      screen.getByRole('button', { name: 'Create booking in Focus Room' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create booking in Board Room' }),
    ).toBeInTheDocument();
    expect(filterButton).not.toHaveTextContent('1/2');

    await user.click(filterButton);
    await user.click(screen.getByRole('checkbox', { name: 'Board Room' }));

    expect(
      screen.getByRole('button', { name: 'Create booking in Focus Room' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create booking in Board Room' }),
    ).not.toBeInTheDocument();
    expect(filterButton).toHaveTextContent('1/2');
    expect(
      screen.queryByText('No rooms selected. Use Filter to show at least one room.'),
    ).not.toBeInTheDocument();
  });

  it('renders the current time marker only for the selected day after mount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T14:15:00.000Z'));

    const { rerender } = render(
      <DaySchedule
        rooms={[ROOM]}
        bookings={[]}
        timezone="UTC"
        schedule={{ startHour: 8, endHour: 18 }}
        selectedDateKey="2026-03-18"
        ownedBookingIds={new Set()}
        editableBookingIds={new Set()}
        selectedBookingId={null}
        isMutating={false}
        onPrevDay={vi.fn()}
        onNextDay={vi.fn()}
        onToday={vi.fn()}
        canCreateBookings
        onCreateSlot={vi.fn()}
        onOpenBooking={vi.fn()}
        onUpdateBooking={vi.fn(async () => undefined)}
        onInlineError={vi.fn()}
      />,
    );

    expect(screen.getByText('14:15')).toBeInTheDocument();

    rerender(
      <DaySchedule
        rooms={[ROOM]}
        bookings={[]}
        timezone="UTC"
        schedule={{ startHour: 8, endHour: 18 }}
        selectedDateKey="2026-03-19"
        ownedBookingIds={new Set()}
        editableBookingIds={new Set()}
        selectedBookingId={null}
        isMutating={false}
        onPrevDay={vi.fn()}
        onNextDay={vi.fn()}
        onToday={vi.fn()}
        canCreateBookings
        onCreateSlot={vi.fn()}
        onOpenBooking={vi.fn()}
        onUpdateBooking={vi.fn(async () => undefined)}
        onInlineError={vi.fn()}
      />,
    );

    expect(screen.queryByText('14:15')).not.toBeInTheDocument();
  });
});
