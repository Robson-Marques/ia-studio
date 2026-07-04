// Connections (Instances — diretriz 52) + Integration Logs (diretriz 55).
import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { SecretsModule } from '../secrets/secrets.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { ConnectionsRepository } from './connections.repository';
import { IntegrationLogsRepository } from './integration-logs.repository';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthController } from './google-oauth.controller';

@Module({
  imports: [RegistryModule, SecretsModule, MarketplaceModule],
  controllers: [ConnectionsController, GoogleOauthController],
  providers: [ConnectionsRepository, IntegrationLogsRepository, ConnectionsService, GoogleOauthService],
  // Repositories exportados pro modulo comm (Fase 3): o orquestrador WhatsApp
  // resolve conexoes e grava IntegrationLog inbound sem duplicar porta ao DB.
  exports: [ConnectionsService, ConnectionsRepository, IntegrationLogsRepository],
})
export class ConnectionsModule {}
