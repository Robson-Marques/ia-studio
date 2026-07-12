// API da config de abertura de OS (setor↔assunto por conexão).
import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../shared/auth/tenant.util';
import { IspOsConfigService } from './isp-os-config.service';
import { OsConfigPair } from './isp-os-config.repository';

interface SaveOsConfigBody {
  connection_id: string;
  pairs: OsConfigPair[];
}

@ApiTags('ISP · Abertura de OS')
@ApiBearerAuth()
@Controller('isp/os-config')
export class IspOsConfigController {
  constructor(private readonly service: IspOsConfigService) {}

  /** Setores e assuntos disponíveis no ERP (Descobrir recursos). */
  @Get('discover')
  @ApiOperation({ summary: 'Descobre setores/assuntos do ERP para a config de OS' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  discover(
    @CurrentUser() user: AuthenticatedUser,
    @Query('connection_id') connectionId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.service.discover(resolveOrganizationId(user, orgQuery), connectionId);
  }

  /** Config salva de uma conexão. */
  @Get()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('connection_id') connectionId: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.service.list(resolveOrganizationId(user, orgQuery), connectionId);
  }

  /** Salva o conjunto de pares setor↔assunto (substitui a config da conexão). */
  @Put()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveOsConfigBody,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.service.save(
      resolveOrganizationId(user, orgQuery),
      body.connection_id,
      user.sub ?? null,
      Array.isArray(body.pairs) ? body.pairs : [],
    );
  }
}
