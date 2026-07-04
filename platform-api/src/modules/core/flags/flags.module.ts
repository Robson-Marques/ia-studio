import { Module } from '@nestjs/common';
import { FlagsController } from './flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { FlagsRepository } from './flags.repository';

@Module({
  controllers: [FlagsController],
  providers: [FeatureFlagsService, FlagsRepository],
  exports: [FeatureFlagsService],
})
export class FlagsModule {}
