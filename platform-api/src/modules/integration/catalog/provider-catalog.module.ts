import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { ProviderCatalogService } from './provider-catalog.service';

@Module({
  imports: [RegistryModule],
  providers: [ProviderCatalogService],
  exports: [ProviderCatalogService],
})
export class ProviderCatalogModule {}
