// Controller do Resource Model (Fase 7). Catalogo canonico + CRUD de
// mappings + Mapper Inteligente (sugestao) + Resource Explorer (read-only).
// Todo endpoint com @RequirePermissions; mutations auditadas no service.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
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
    @Query('resource_type') resourceType?: string,
    @Query('provider_key') providerKey?: string,
  ) {
    return this.mappings.findAll({
      resourceType: resourceType || undefined,
      providerKey: providerKey || undefined,
    });
  }

  @Get('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_READ)
  findOne(
    @Param('id') id: string,
  ) {
    return this.mappings.findById(id);
  }

  @Post('mappings')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMappingDto,
  ) {
    return this.mappings.create(dto, user.sub ?? null);
  }

  @Patch('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMappingDto,
  ) {
    return this.mappings.update(id, dto);
  }

  @Delete('mappings/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPINGS_WRITE)
  remove(
    @Param('id') id: string,
  ) {
    return this.mappings.remove(id);
  }

  // ─── Mapper Inteligente (sugestao — nunca aplica sozinho) ─────
  @Post('mappings/suggest')
  @RequirePermissions(PERMISSIONS.RESOURCE_MAPPER_SUGGEST)
  suggestMapping(
    @Body() dto: SuggestMappingDto,
  ) {
    return this.suggest.suggest(dto);
  }

  // ─── Resource Explorer (read-only) ──────────────────
  @Get('explore')
  @RequirePermissions(PERMISSIONS.RESOURCE_EXPLORE_READ)
  explore(
    @Query('connection_id') connectionId: string,
    @Query('resource_type') resourceType: string,
    @Query('query') query?: string,
  ) {
    return this.explorer.explore({
      connectionId,
      resourceType,
      query: query || undefined,
    });
  }
}
