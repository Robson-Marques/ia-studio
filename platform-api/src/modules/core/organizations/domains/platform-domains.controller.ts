// Console — registro de dominios/subdominios da instalacao (fase 1).
// Apenas o administrador local define os endereços da própria instalação.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainStatus } from '@prisma/client';
import { InstallationAdminOnly } from '../../../../shared/auth/permissions.decorator';
import { CurrentUserId } from '../../../../shared/auth/current-user.decorator';
import { PlatformDomainsService } from './platform-domains.service';
import { CreateDomainDto, SetAutoVerifyDto, SetBaseDomainDto, UpdateDomainDto } from './dto/platform-domains.dtos';

@ApiTags('Console — Domínios')
@ApiBearerAuth()
@InstallationAdminOnly()
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

  /** Lista os hosts da instalação. */
  @Get()
  list(
    @Query('status') status?: string,
  ) {
    return this.domains.list({
      status: (status as DomainStatus) || undefined,
    });
  }

  /** Reverificação automática dos endereços que ainda não entraram no ar.
   *  ANTES de `:id` de propósito — senão "auto-verify" cairia como id. */
  @Get('auto-verify')
  @ApiOperation({ summary: 'Situação da reverificação automática' })
  async getAutoVerify() {
    return { auto_verify: await this.domains.isAutoVerifyEnabled() };
  }

  @Patch('auto-verify')
  @ApiOperation({ summary: 'Liga/desliga a reverificação automática' })
  setAutoVerify(@Body() dto: SetAutoVerifyDto) {
    return this.domains.setAutoVerify(dto.enabled === true);
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

  /**
   * "Verificar e ativar": manda o servidor conferir o DNS, publicar o vhost e
   * emitir o certificado. Responde na hora (a operação roda em background e
   * grava o resultado no próprio registro).
   */
  @Post(':id/activate')
  @ApiOperation({ summary: 'Verifica o DNS, publica o endereço e emite o certificado' })
  activate(@Param('id') id: string) {
    return this.domains.activate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.domains.remove(id);
  }
}
