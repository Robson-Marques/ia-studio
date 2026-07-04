import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetMembershipDto } from './dto/set-membership.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_USERS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('organization_id') orgQuery?: string,
    @Query('include_deleted') includeDeleted?: string,
  ) {
    return this.users.findAll(resolveOrganizationId(user, orgQuery), includeDeleted === 'true');
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.update(resolveOrganizationId(user, orgQuery), id, dto, user.sub);
  }

  // Soft-delete (nunca hard): deleted_at + is_active=false + revogacao de sessao
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_INACTIVATE)
  inactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.inactivate(resolveOrganizationId(user, orgQuery), id, user.sub);
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.activate(resolveOrganizationId(user, orgQuery), id, user.sub);
  }

  // ─── Membros de workspace ───────────────────────────
  @Get(':id/workspaces')
  @RequirePermissions(PERMISSIONS.CORE_USERS_READ)
  memberships(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.listMemberships(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/workspaces')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  setMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetMembershipDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.setMembership(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete(':id/workspaces/:workspaceId')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  removeMembership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('workspaceId') workspaceId: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.users.removeMembership(resolveOrganizationId(user, orgQuery), id, workspaceId);
  }
}
