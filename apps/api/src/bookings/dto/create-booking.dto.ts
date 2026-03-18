import { BookingCriticality } from '../../generated/prisma';

export type CreateBookingDto = {
  roomId: string;
  startAt: string;
  endAt: string;
  subject: string;
  criticality?: BookingCriticality;
};


