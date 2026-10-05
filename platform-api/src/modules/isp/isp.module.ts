// Solucao vertical ISP (Fase 6) — Manutencao/Incidentes + tools do agente ISP.
// "Nada de ISP no core": tudo mora aqui, no IxcProvider (Integration) e nas
// tools ISP (registradas no registry exportado pelo AiModule).
//
// Sem ciclo de modulo: IspModule importa AiModule (pega ToolRegistryService),
// mas o AiModule NUNCA importa o IspModule. As tools ISP se registram no mesmo
// registry das builtin (IspTools.onModuleInit) e sao semeadas no catalogo
// ai_tools pelo seed da Fase 5 (AiProvidersSeedService itera toolRegistry.all()).
// Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { CommModule } from '../comm/comm.module';
import { AutomationModule } from '../automation/automation.module';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../core/settings/settings.module';

import { IspRepository } from './isp.repository';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspConnectivityService } from './isp-connectivity.service';
import { IspDiagnosisService } from './isp-diagnosis.service';
import { IncidentLookupService } from './incident-lookup.service';
import { IspDispatchService } from './isp-dispatch.service';
import { IspTeamAlertService } from './isp-team-alert.service';
import { IspIncidentsService } from './isp-incidents.service';
import { IspOutageDetectionCron } from './isp-outage-detection.cron';
import { IspTools } from './isp-tools';
import { IspController } from './isp.controller';
import { IspOsConfigRepository } from './isp-os-config.repository';
import { IspOsConfigService } from './isp-os-config.service';
import { IspOsConfigController } from './isp-os-config.controller';
import { IspPaymentLinkRepository } from './isp-payment-link.repository';
import { IspPaymentLinkService } from './isp-payment-link.service';
import { IspPaymentLinkController } from './isp-payment-link.controller';

@Module({
  imports: [IntegrationModule, CommModule, AutomationModule, AiModule, SettingsModule],
  controllers: [IspController, IspOsConfigController, IspPaymentLinkController],
  providers: [
    IspRepository,
    IspConnectionResolver,
    IspConnectivityService,
    IspDiagnosisService,
    IncidentLookupService,
    IspDispatchService,
    IspTeamAlertService,
    IspIncidentsService,
    IspOutageDetectionCron,
    IspTools,
    IspOsConfigRepository,
    IspOsConfigService,
    IspPaymentLinkRepository,
    IspPaymentLinkService,
  ],
  // IncidentLookupService exportado pra futura reuso (nos de automacao ISP).
  // IspOsConfigService exportado pra Etapa 3 (a tool abrir_os usa a config).
  exports: [IncidentLookupService, IspOsConfigService],
})
export class IspModule {}
