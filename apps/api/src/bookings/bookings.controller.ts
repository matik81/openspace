import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtSubject } from '../auth/types/jwt-subject.type';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingsService } from './bookings.service';

type AuthenticatedRequest = {
  user?: JwtSubject;
};

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  async listBookings(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query('mine') mine: string | undefined,
    @Query('includePast') includePast: string | undefined,
    @Query('includeCancelled') includeCancelled: string | undefined,
  ) {
    return this.bookingsService.listBookings(
      this.extractAuthUser(request),
      workspaceId,
      {
        mine,
        includePast,
        includeCancelled,
      },
    );
  }

  @Post()
  async createBooking(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateBookingDto,
  ) {
    return this.bookingsService.createBooking(
      this.extractAuthUser(request),
      workspaceId,
      body,
    );
  }

  @Post(':bookingId/cancel')
  async cancelBooking(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingsService.cancelBooking(
      this.extractAuthUser(request),
      workspaceId,
      bookingId,
    );
  }

  private extractAuthUser(request: AuthenticatedRequest): { userId: string } {
    if (!request.user?.sub) {
      throw new ForbiddenException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    return {
      userId: request.user.sub,
    };
  }
}
