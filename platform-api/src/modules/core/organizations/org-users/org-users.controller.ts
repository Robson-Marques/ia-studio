// Console — gestao dos usuarios de uma organization cliente. Rotas exclusivas
// do operador da plataforma (@PlatformAdminOnly). Nao ha DELETE aqui: o Console
// so lista, edita nome/e-mail e reseta senha (inativacao/ciclo de vida do
// usuario vive no painel do cliente).
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../../../shared/auth/platform-admin.guard';
import { OrgUsersService } from './org-users.service';
import { UpdateOrgUserDto } from './dto/update-org-user.dto';
import { ResetOrgUserPasswordDto } from './dto/reset-org-user-password.dto';

@ApiTags('Console — Org Users')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/organizations/:orgId/users')
export class OrgUsersController {
  constructor(private readonly orgUsers: OrgUsersService) {}

  @Get()
  findAll(@Param('orgId') orgId: string) {
    return this.orgUsers.findAll(orgId);
  }

  @Patch(':userId')
  update(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateOrgUserDto,
  ) {
    return this.orgUsers.update(orgId, userId, dto);
  }

  @Post(':userId/reset-password')
  resetPassword(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: ResetOrgUserPasswordDto,
  ) {
    return this.orgUsers.resetPassword(orgId, userId, dto);
  }
}
