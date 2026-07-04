// Workspaces + Environments da org do ator. Platform admin pode operar uma
// org especifica via ?organization_id (resolveOrganizationId).
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_WORKSPACES_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.workspaces.findAll(resolveOrganizationId(user, orgQuery));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CORE_WORKSPACES_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workspaces.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CORE_WORKSPACES_WRITE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(resolveOrganizationId(user, dto.organization_id), dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CORE_WORKSPACES_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workspaces.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  // ─── Environments ───────────────────────────────────
  @Get(':id/environments')
  @RequirePermissions(PERMISSIONS.CORE_ENVIRONMENTS_READ)
  async environments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const ws = await this.workspaces.findById(resolveOrganizationId(user, orgQuery), id);
    return ws.environments;
  }

  @Post(':id/environments')
  @RequirePermissions(PERMISSIONS.CORE_ENVIRONMENTS_WRITE)
  createEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateEnvironmentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workspaces.createEnvironment(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Patch(':id/environments/:environmentId')
  @RequirePermissions(PERMISSIONS.CORE_ENVIRONMENTS_WRITE)
  updateEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: UpdateEnvironmentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workspaces.updateEnvironment(
      resolveOrganizationId(user, orgQuery),
      id,
      environmentId,
      dto,
    );
  }
}
