import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedRepository } from './seed.repository';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  providers: [SeedService, SeedRepository],
})
export class SeedModule {}
