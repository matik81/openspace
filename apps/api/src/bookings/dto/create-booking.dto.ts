import { BookingCriticality } from '@prisma/client';

export type CreateBookingDto = {
  roomId: string;
  startAt: string;
  endAt: string;
  subject: string;
  criticality?: BookingCriticality;
};
