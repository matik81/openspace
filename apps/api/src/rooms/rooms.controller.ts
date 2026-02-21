import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtSubject } from '../auth/types/jwt-subject.type';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

type AuthenticatedRequest = {
  user?: JwtSubject;
};

@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async createRoom(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateRoomDto,
  ) {
    return this.roomsService.createRoom(
      this.extractAuthUser(request),
      workspaceId,
      body,
    );
  }

  @Get()
  async listRooms(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.roomsService.listRooms(this.extractAuthUser(request), workspaceId);
  }

  @Get(':roomId')
  async getRoom(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.getRoom(
      this.extractAuthUser(request),
      workspaceId,
      roomId,
    );
  }

  @Patch(':roomId')
  async updateRoom(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('roomId') roomId: string,
    @Body() body: UpdateRoomDto,
  ) {
    return this.roomsService.updateRoom(
      this.extractAuthUser(request),
      workspaceId,
      roomId,
      body,
    );
  }

  @Delete(':roomId')
  async deleteRoom(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.roomsService.deleteRoom(
      this.extractAuthUser(request),
      workspaceId,
      roomId,
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
