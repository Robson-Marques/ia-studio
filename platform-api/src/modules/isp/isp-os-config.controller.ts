// API da config de abertura de OS (setor↔assunto por conexão).
import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
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
    @Query('connection_id') connectionId?: string,
  ) {
    return this.service.discover(connectionId);
  }

  /** Config salva de uma conexão. */
  @Get()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  list(
    @Query('connection_id') connectionId: string,
  ) {
    return this.service.list(connectionId);
  }

  /** Salva o conjunto de pares setor↔assunto (substitui a config da conexão). */
  @Put()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  save(
    @Body() body: SaveOsConfigBody,
  ) {
    return this.service.save(
      body.connection_id,
      null,
      Array.isArray(body.pairs) ? body.pairs : [],
    );
  }

  /** Mapa setor→fila (Suporte/Financeiro) — para onde a IA encaminha a conversa. */
  @Get('filas')
  @ApiOperation({ summary: 'Mapa setor→fila (para o handoff do bot)' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  getFilas() {
    return this.service.getQueueMapping();
  }

  /** Salva o mapa setor→fila. Cada valor é o id de uma AttendanceQueue (ou vazio). */
  @Put('filas')
  @ApiOperation({ summary: 'Salva o mapa setor→fila' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  setFilas(
    @Body() body: { suporte?: string | null; financeiro?: string | null },
  ) {
    return this.service.setQueueMapping(body ?? {});
  }

  /** Máximo de boletos em aberto que a IA envia numa mensagem (0 = todos). */
  @Get('boleto-max')
  @ApiOperation({ summary: 'Máximo de boletos que a IA envia' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  async getBoletoMax() {
    return { max: await this.service.getBoletoMax() };
  }

  /** Salva o máximo de boletos (0 a 20; 0 = todos os em aberto). */
  @Put('boleto-max')
  @ApiOperation({ summary: 'Salva o máximo de boletos que a IA envia' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  async setBoletoMax(
    @Body() body: { max?: number },
  ) {
    return { max: await this.service.setBoletoMax(Number(body?.max ?? 0)) };
  }

  /** Config do link público de pagamento (validade + URL pública). */
  @Get('pagamento')
  @ApiOperation({ summary: 'Config do link de pagamento (TTL + URL pública)' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  getPagamento() {
    return this.service.getPagamentoConfig();
  }

  /** Salva a config do link de pagamento. */
  @Put('pagamento')
  @ApiOperation({ summary: 'Salva a config do link de pagamento' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  setPagamento(
    @Body() body: { ttl_horas?: number; base_url?: string },
  ) {
    return this.service.setPagamentoConfig(body ?? {});
  }

  /** Config do alerta de incidente à equipe de plantão (equipe + limiar + template). */
  @Get('plantao')
  @ApiOperation({ summary: 'Config do alerta de incidente à equipe de plantão' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  getPlantao() {
    return this.service.getPlantaoConfig();
  }

  /** Salva a config do plantão. `team_id` é o id de uma AttendanceTeam (ou vazio). */
  @Put('plantao')
  @ApiOperation({ summary: 'Salva a config do alerta de incidente à equipe' })
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  setPlantao(
    @Body() body: { team_id?: string | null; limiar_pct?: number; template?: string | null; cooldown_min?: number },
  ) {
    return this.service.setPlantaoConfig(body ?? {});
  }
}
