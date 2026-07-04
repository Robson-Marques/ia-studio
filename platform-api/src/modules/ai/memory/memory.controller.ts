// Memoria — perfis (CRUD) + navegacao de entradas (read-only pelo painel).
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { MemoryService } from './memory.service';
import { CreateMemoryProfileDto, UpdateMemoryProfileDto } from './dto/memory.dtos';

@ApiTags('IA — Memória')
@ApiBearerAuth()
@Controller('ai/memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get('profiles')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_READ)
  listProfiles(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.memory.findProfiles(resolveOrganizationId(user, orgQuery), { workspaceId, environmentId });
  }

  @Post('profiles')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_WRITE)
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemoryProfileDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.memory.createProfile(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch('profiles/:id')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_WRITE)
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryProfileDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.memory.updateProfile(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Get('profiles/:id/entries')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_READ)
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('scope_key') scopeKey?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.memory.listEntries(resolveOrganizationId(user, orgQuery), id, scopeKey);
  }
}
