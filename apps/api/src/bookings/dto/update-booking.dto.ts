import { BookingCriticality } from '@prisma/client';

export type UpdateBookingDto = {
  roomId?: string;
  startAt?: string;
  endAt?: string;
  subject?: string;
  criticality?: BookingCriticality;
};

