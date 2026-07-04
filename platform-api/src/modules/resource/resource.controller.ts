// Controller do Resource Model (Fase 7). Catalogo canonico + CRUD de
// mappings + Mapper Inteligente (sugestao) + Resource Explorer (read-only).
// Todo endpoint com @RequirePermissions; mutations auditadas no service.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../shared/auth/tenant.util';
import { ResourceMappingsService } from './resource-mappings.service';
import { ResourceExplorerService } from './resource-explorer.service';
import { ResourceSuggestService } from './resource-suggest.service';
import { CreateMappingDto, UpdateMappingDto, SuggestMappingDto } from './dto/resource.dtos';

@ApiTags('Recursos — Resource Model / Mapper / Explorer')
@ApiBearerAuth()
@Controller('resource')
export class ResourceController {
  constructor(
    private readonly mappings: ResourceMappingsService,
    private readonly explorer: ResourceExplorerService,
    private readonly suggest: ResourceSuggestService,
  ) {}

  // ─── Catalogo de tipos canonicos ────────────────────
  @Get('catalog')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_READ)
  catalog() {
    return this.mappings.catalog();
  }

  // ─── Mapeamentos (CRUD) ─────────────────────────────
  @Get('mappings')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('resource_type') resourceType?: string,
    @Query('provider_key') providerKey?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mappings.findAll(resolveOrganizationId(user, orgQuery), {
      workspaceId: workspaceId || undefined,
      environmentId: environmentId || undefined,
      resourceType: resourceType || undefined,
      providerKey: providerKey || undefined,
    });
  }

  @Get('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_READ)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mappings.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post('mappings')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMappingDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mappings.create(resolveOrganizationId(user, orgQuery), dto, user.sub ?? null);
  }

  @Patch('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMappingDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mappings.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.mappings.remove(resolveOrganizationId(user, orgQuery), id);
  }

  // ─── Mapper Inteligente (sugestao — nunca aplica sozinho) ─────
  @Post('mappings/suggest')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPER_SUGGEST)
  suggestMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SuggestMappingDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.suggest.suggest(resolveOrganizationId(user, orgQuery), dto);
  }

  // ─── Resource Explorer (read-only) ──────────────────
  @Get('explore')
  @RequirePermissions(PERMISSIONS.RESOURCE_EXPLORE_READ)
  explore(
    @CurrentUser() user: AuthenticatedUser,
    @Query('connection_id') connectionId: string,
    @Query('resource_type') resourceType: string,
    @Query('query') query?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.explorer.explore({
      organizationId: resolveOrganizationId(user, orgQuery),
      connectionId,
      resourceType,
      query: query || undefined,
    });
  }
}
