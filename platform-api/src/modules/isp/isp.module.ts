// Solucao vertical ISP (Fase 6) — Manutencao/Incidentes + tools do agente ISP.
// "Nada de ISP no core": tudo mora aqui, no AltaredeProvider (Integration) e nas
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

import { IspRepository } from './isp.repository';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspConnectivityService } from './isp-connectivity.service';
import { IncidentLookupService } from './incident-lookup.service';
import { IspDispatchService } from './isp-dispatch.service';
import { IspIncidentsService } from './isp-incidents.service';
import { IspOutageDetectionCron } from './isp-outage-detection.cron';
import { IspTools } from './isp-tools';
import { IspController } from './isp.controller';
import { IspExampleRepository } from './isp-example.repository';
import { IspExampleAssistantSeed } from './isp-example-assistant.seed';
import { IspOsConfigRepository } from './isp-os-config.repository';
import { IspOsConfigService } from './isp-os-config.service';
import { IspOsConfigController } from './isp-os-config.controller';

@Module({
  imports: [IntegrationModule, CommModule, AutomationModule, AiModule],
  controllers: [IspController, IspOsConfigController],
  providers: [
    IspRepository,
    IspConnectionResolver,
    IspConnectivityService,
    IncidentLookupService,
    IspDispatchService,
    IspIncidentsService,
    IspOutageDetectionCron,
    IspTools,
    IspExampleRepository,
    IspExampleAssistantSeed,
    IspOsConfigRepository,
    IspOsConfigService,
  ],
  // IncidentLookupService exportado pra futura reuso (nos de automacao ISP).
  // IspOsConfigService exportado pra Etapa 3 (a tool abrir_os usa a config).
  exports: [IncidentLookupService, IspOsConfigService],
})
export class IspModule {}
