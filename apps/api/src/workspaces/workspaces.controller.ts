import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtSubject } from '../auth/types/jwt-subject.type';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { WorkspacesService } from './workspaces.service';

type AuthenticatedRequest = {
  user?: JwtSubject;
};

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  async createWorkspace(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateWorkspaceDto,
  ) {
    return this.workspacesService.createWorkspace(this.extractAuthUser(request), body);
  }

  @Get()
  async listVisibleWorkspaces(@Req() request: AuthenticatedRequest) {
    return this.workspacesService.listVisibleWorkspaces(
      this.extractAuthUser(request),
    );
  }

  @Post(':workspaceId/invitations')
  async inviteUser(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: InviteUserDto,
  ) {
    return this.workspacesService.inviteUser(
      this.extractAuthUser(request),
      workspaceId,
      body,
    );
  }

  @Post('invitations/:invitationId/accept')
  async acceptInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspacesService.acceptInvitation(
      this.extractAuthUser(request),
      invitationId,
    );
  }

  @Post('invitations/:invitationId/reject')
  async rejectInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId') invitationId: string,
  ) {
    return this.workspacesService.rejectInvitation(
      this.extractAuthUser(request),
      invitationId,
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
