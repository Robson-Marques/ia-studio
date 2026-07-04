// Marketplace de Conectores (diretrizes 1/43/48).
import { Module } from '@nestjs/common';
import { RegistryModule } from '../registry/registry.module';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceConsoleController } from './marketplace-console.controller';

@Module({
  imports: [RegistryModule],
  controllers: [MarketplaceController, MarketplaceConsoleController],
  providers: [MarketplaceRepository, MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
