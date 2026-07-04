// Resource Model + Mapper + Explorer (Fase 7 — diretrizes 9/23/24/25).
// A plataforma NAO e dona de dados de negocio: persiste so o mapeamento
// (resource_mappings). Importa IntegrationModule (ConnectionsService, para
// execute/discover read-only) e AiModule (LlmProviderService + Orchestrator,
// para o Mapper Inteligente). Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { AiModule } from '../ai/ai.module';

import { ResourceRepository } from './resource.repository';
import { ResourceMapperService } from './resource-mapper.service';
import { ResourceMappingsService } from './resource-mappings.service';
import { ResourceExplorerService } from './resource-explorer.service';
import { ResourceSuggestService } from './resource-suggest.service';
import { ResourceSeedService } from './resource-seed.service';
import { ResourceController } from './resource.controller';

@Module({
  imports: [IntegrationModule, AiModule],
  controllers: [ResourceController],
  providers: [
    ResourceRepository,
    ResourceMapperService,
    ResourceMappingsService,
    ResourceExplorerService,
    ResourceSuggestService,
    ResourceSeedService,
  ],
  // ResourceMapperService/Repository exportados para reuso (Explorer externo,
  // nós de automação futuros) sem duplicar a porta de mapeamento.
  exports: [ResourceMapperService, ResourceRepository],
})
export class ResourceModule {}
