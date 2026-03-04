'use client';

import { WorkspaceRightSidebar } from '@/components/workspace/WorkspaceRightSidebar';
import { PUBLIC_TIMEZONE } from '@/components/public/public-preview-data';
import { buildMiniCalendarCells, type SidebarBookingGroup } from '@/lib/time';

export function PublicRightSidebar({
  monthKey,
  miniCalendarCells,
  bookingGroups,
  onSelectDateKey,
  onSelectMonthKey,
  onToday,
}: {
  monthKey: string;
  miniCalendarCells: ReturnType<typeof buildMiniCalendarCells>;
  bookingGroups: SidebarBookingGroup[];
  onSelectDateKey: (value: string) => void;
  onSelectMonthKey: (value: string) => void;
  onToday: () => void;
}) {
  return (
    <WorkspaceRightSidebar
      timezone={PUBLIC_TIMEZONE}
      monthKey={monthKey}
      onSelectDateKey={onSelectDateKey}
      onSelectMonthKey={onSelectMonthKey}
      onToday={onToday}
      miniCalendarCells={miniCalendarCells}
      bookingGroups={bookingGroups}
      onOpenBooking={() => undefined}
    />
  );
}
