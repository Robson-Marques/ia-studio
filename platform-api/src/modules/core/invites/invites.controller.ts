import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { Public } from '../../../shared/auth/public.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@ApiTags('Invites')
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @ApiBearerAuth()
  @Get('invites')
  @RequirePermissions(PERMISSIONS.CORE_INVITES_READ)
  findAll() {
    return this.invites.findAll();
  }

  @ApiBearerAuth()
  @Post('invites')
  @RequirePermissions(PERMISSIONS.CORE_INVITES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invites.create(dto, user.sub);
  }

  @ApiBearerAuth()
  @Delete('invites/:id')
  @RequirePermissions(PERMISSIONS.CORE_INVITES_WRITE)
  revoke(
    @Param('id') id: string,
  ) {
    return this.invites.revoke(id);
  }

  // Aceite publico do convite — cria o usuario com a senha enviada e vincula.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('auth/invites/:token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.invites.accept(token, dto);
  }
}
