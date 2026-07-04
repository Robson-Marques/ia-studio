// Console do Desenvolvedor (Fase 7 — diretriz 28). Depende do Integration
// Manager (ConnectionsService) e do AiModule (LlmProviderService + ToolRuntime).
// Nao possui repositorio proprio: nao persiste nada — so orquestra execucoes de
// teste via conexoes, com auditoria e IntegrationLog. Ver README.md.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { AiModule } from '../ai/ai.module';
import { DevtoolsService } from './devtools.service';
import { DevtoolsController } from './devtools.controller';

@Module({
  imports: [IntegrationModule, AiModule],
  controllers: [DevtoolsController],
  providers: [DevtoolsService],
})
export class DevtoolsModule {}
