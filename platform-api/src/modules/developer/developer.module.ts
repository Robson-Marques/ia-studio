// Developer Center (Fase 7 — diretriz 57): gestao de API Keys + fachada da
// Public API (/api/v1/public/*) protegida por ApiKeyGuard. Sem dependencia de
// outros modulos de negocio — so PrismaModule (global). Ver README.md.
import { Module } from '@nestjs/common';
import { DeveloperRepository } from './developer.repository';
import { DeveloperService } from './developer.service';
import { DeveloperController } from './developer.controller';
import { PublicApiController } from './public/public-api.controller';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  controllers: [DeveloperController, PublicApiController],
  providers: [DeveloperRepository, DeveloperService, ApiKeyGuard],
  exports: [DeveloperService],
})
export class DeveloperModule {}
