import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedRepository } from './seed.repository';

@Module({
  providers: [SeedService, SeedRepository],
})
export class SeedModule {}
