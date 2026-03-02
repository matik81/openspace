'use client';

import { DateTime } from 'luxon';
import { groupMyBookingsForSidebar, type SidebarBookingGroup } from '@/lib/time';
import type { BookingListItem, RoomItem } from '@/lib/types';

export const PUBLIC_TIMEZONE = 'Europe/Rome';
export const PUBLIC_USER_ID = 'public-preview-user';
export const PUBLIC_SCHEDULE = {
  startHour: 8,
  endHour: 20,
};

const PUBLIC_WORKSPACE_ID = 'public-demo';

export const PUBLIC_PREVIEW_ROOMS: RoomItem[] = [
  {
    id: 'room-focus',
    workspaceId: PUBLIC_WORKSPACE_ID,
    name: 'Focus Room',
    description: null,
    status: 'ACTIVE',
    cancelledAt: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'room-collab',
    workspaceId: PUBLIC_WORKSPACE_ID,
    name: 'Collab Hub',
    description: null,
    status: 'ACTIVE',
    cancelledAt: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'room-board',
    workspaceId: PUBLIC_WORKSPACE_ID,
    name: 'Board Room',
    description: null,
    status: 'ACTIVE',
    cancelledAt: null,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
];

type PreviewBookingTemplate = {
  id: string;
  roomId: string;
  roomName: string;
  subject: string;
  createdByDisplayName: string;
  startTime: string;
  endTime: string;
  dayOffset: number;
};

const PUBLIC_PREVIEW_BOOKING_TEMPLATES: PreviewBookingTemplate[] = [
  {
    id: 'placeholder-1',
    roomId: 'room-focus',
    roomName: 'Focus Room',
    subject: 'Product sync',
    createdByDisplayName: 'Giulia Rossi',
    startTime: '09:00',
    endTime: '10:30',
    dayOffset: 0,
  },
  {
    id: 'placeholder-2',
    roomId: 'room-collab',
    roomName: 'Collab Hub',
    subject: 'Sprint planning',
    createdByDisplayName: 'Marco Bianchi',
    startTime: '11:00',
    endTime: '12:00',
    dayOffset: 0,
  },
  {
    id: 'placeholder-3',
    roomId: 'room-board',
    roomName: 'Board Room',
    subject: 'Town hall',
    createdByDisplayName: 'Sara Conti',
    startTime: '15:00',
    endTime: '16:30',
    dayOffset: 0,
  },
  {
    id: 'placeholder-4',
    roomId: 'room-focus',
    roomName: 'Focus Room',
    subject: 'Design review',
    createdByDisplayName: 'Luca Verdi',
    startTime: '10:00',
    endTime: '11:00',
    dayOffset: 1,
  },
  {
    id: 'placeholder-5',
    roomId: 'room-collab',
    roomName: 'Collab Hub',
    subject: 'Client call',
    createdByDisplayName: 'Anna Neri',
    startTime: '14:00',
    endTime: '15:00',
    dayOffset: 3,
  },
  {
    id: 'placeholder-6',
    roomId: 'room-board',
    roomName: 'Board Room',
    subject: 'Weekly recap',
    createdByDisplayName: 'Paolo Costa',
    startTime: '16:00',
    endTime: '17:00',
    dayOffset: 7,
  },
];

function buildUtcIso(dateKey: string, time: string): string {
  return (
    DateTime.fromFormat(`${dateKey} ${time}`, 'yyyy-LL-dd HH:mm', { zone: PUBLIC_TIMEZONE })
      .toUTC()
      .toISO() ?? '2026-01-01T00:00:00.000Z'
  );
}

export function buildPublicPreviewBookings(anchorDateKey: string): BookingListItem[] {
  return PUBLIC_PREVIEW_BOOKING_TEMPLATES.map((template) => {
    const localDate = DateTime.fromISO(anchorDateKey, { zone: PUBLIC_TIMEZONE }).plus({
      days: template.dayOffset,
    });
    const dateKey = localDate.toFormat('yyyy-LL-dd');
    const startAt = buildUtcIso(dateKey, template.startTime);
    const endAt = buildUtcIso(dateKey, template.endTime);

    return {
      id: template.id,
      workspaceId: PUBLIC_WORKSPACE_ID,
      roomId: template.roomId,
      roomName: template.roomName,
      createdByUserId: PUBLIC_USER_ID,
      createdByDisplayName: template.createdByDisplayName,
      startAt,
      endAt,
      subject: template.subject,
      criticality: 'MEDIUM',
      status: 'ACTIVE',
      createdAt: startAt,
      updatedAt: startAt,
    };
  });
}

export function buildPublicPreviewBookingGroups(
  bookings: BookingListItem[],
): SidebarBookingGroup[] {
  return groupMyBookingsForSidebar(bookings, PUBLIC_TIMEZONE, PUBLIC_USER_ID);
}
