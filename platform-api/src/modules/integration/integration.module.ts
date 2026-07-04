// Integration Manager (Fase 2) — agrega registry + marketplace + connections
// + secrets + storage. Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { RegistryModule } from './registry/registry.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { ConnectionsModule } from './connections/connections.module';
import { SecretsModule } from './secrets/secrets.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [RegistryModule, MarketplaceModule, ConnectionsModule, SecretsModule, StorageModule],
  exports: [RegistryModule, MarketplaceModule, ConnectionsModule, SecretsModule, StorageModule],
})
export class IntegrationModule {}
