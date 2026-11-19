// Integration Manager — agrega registry + catálogo local + connections
// + secrets + storage. Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { RegistryModule } from './registry/registry.module';
import { ProviderCatalogModule } from './catalog/provider-catalog.module';
import { ConnectionsModule } from './connections/connections.module';
import { SecretsModule } from './secrets/secrets.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [RegistryModule, ProviderCatalogModule, ConnectionsModule, SecretsModule, StorageModule],
  exports: [RegistryModule, ProviderCatalogModule, ConnectionsModule, SecretsModule, StorageModule],
})
export class IntegrationModule {}
