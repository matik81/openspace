import { BookingCriticality } from '../../generated/prisma';

export type UpdateBookingDto = {
  roomId?: string;
  startAt?: string;
  endAt?: string;
  subject?: string;
  criticality?: BookingCriticality;
};



