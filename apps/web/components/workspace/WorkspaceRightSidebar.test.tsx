import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from 'luxon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { buildMiniCalendarCells } from '@/lib/time';
import type { BookingListItem } from '@/lib/types';

const ORIGINAL_SETTINGS_NOW = Settings.now;
const FIXED_NOW = new Date('2026-03-18T09:30:00.000Z').getTime();

function createBooking(overrides: Partial<BookingListItem> = {}): BookingListItem {
  return {
    id: 'booking-1',
    workspaceId: 'workspace-1',
    roomId: 'room-1',
    roomName: 'Focus Room',
    createdByUserId: 'user-1',
    createdByDisplayName: 'Ada Lovelace',
    startAt: '2026-03-18T09:00:00.000Z',
    endAt: '2026-03-18T10:00:00.000Z',
    subject: 'Deep work',
    criticality: 'MEDIUM',
    status: 'ACTIVE',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('WorkspaceRightSidebar', () => {
  afterEach(() => {
    Settings.now = ORIGINAL_SETTINGS_NOW;
  });

  it('renders the sidebar calendar and forwards date selection changes', async () => {
    Settings.now = () => FIXED_NOW;

    const onSelectDateKey = vi.fn();
    const onSelectMonthKey = vi.fn();
    const onToday = vi.fn();
    const onOpenBooking = vi.fn();

    render(
      <WorkspaceRightSidebar
        timezone="UTC"
        monthKey="2026-03"
        onSelectDateKey={onSelectDateKey}
        onSelectMonthKey={onSelectMonthKey}
        onToday={onToday}
        miniCalendarCells={buildMiniCalendarCells({
          timezone: 'UTC',
          monthKey: '2026-03',
          selectedDateKey: '2026-03-18',
          markerCountByDateKey: new Map([['2026-03-19', 1]]),
        })}
        bookingGroups={[
          {
            key: 'today',
            label: 'Today',
            items: [createBooking()],
          },
        ]}
        onOpenBooking={onOpenBooking}
      />,
    );

    const user = userEvent.setup();

    expect(screen.getByText('March 2026')).toBeVisible();
    expect(screen.queryByText('UTC')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Select 2026-03-19' }));
    expect(onSelectDateKey).toHaveBeenCalledWith('2026-03-19');
    expect(onSelectMonthKey).toHaveBeenCalledWith('2026-03');

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onSelectMonthKey).toHaveBeenCalledWith('2026-02');

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onToday).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /deep work/i }));
    expect(onOpenBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 'booking-1' }));
  });
});
