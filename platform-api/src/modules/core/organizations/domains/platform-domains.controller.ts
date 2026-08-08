// Console — registro de dominios/subdominios da instalacao (fase 1).
// Super-only (@PlatformAdminOnly, diretriz 41): quem define por qual endereco a
// plataforma e cada cliente atendem e o operador do SaaS. Quando a gestao for
// aberta ao admin da propria org (fase futura), entra perm no catalogo + guard
// por organizacao — nao se afrouxa este controller.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainScope, DomainStatus } from '@prisma/client';
import { PlatformAdminOnly } from '../../../../shared/auth/platform-admin.guard';
import { CurrentUserId } from '../../../../shared/auth/current-user.decorator';
import { PlatformDomainsService } from './platform-domains.service';
import { CreateDomainDto, SetBaseDomainDto, UpdateDomainDto } from './dto/platform-domains.dtos';

@ApiTags('Console — Domínios')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/domains')
export class PlatformDomainsController {
  constructor(private readonly domains: PlatformDomainsService) {}

  /** Domínio-base da instalação (pai dos subdomínios dos clientes). */
  @Get('base')
  @ApiOperation({ summary: 'Domínio-base da instalação' })
  async getBase() {
    return { base_domain: await this.domains.getBaseDomain() };
  }

  @Patch('base')
  @ApiOperation({ summary: 'Define o domínio-base da instalação' })
  setBase(@Body() dto: SetBaseDomainDto) {
    return this.domains.setBaseDomain(dto.base_domain);
  }

  /** Lista os hosts. `organization_id=null` filtra os da plataforma. */
  @Get()
  list(
    @Query('organization_id') organizationId?: string,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
  ) {
    return this.domains.list({
      organizationId: organizationId === 'null' ? null : organizationId || undefined,
      scope: (scope as DomainScope) || undefined,
      status: (status as DomainStatus) || undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.domains.findById(id);
  }

  @Post()
  create(@Body() dto: CreateDomainDto, @CurrentUserId() userId?: string) {
    return this.domains.create(dto, userId ?? null);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDomainDto) {
    return this.domains.update(id, dto);
  }

  /** Promove a endereço principal do escopo (organização + superfície). */
  @Post(':id/primary')
  setPrimary(@Param('id') id: string) {
    return this.domains.setPrimary(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.domains.remove(id);
  }
}
