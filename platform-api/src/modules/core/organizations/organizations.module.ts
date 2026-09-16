import { Module } from '@nestjs/common';
import { PlatformDomainsController } from './domains/platform-domains.controller';
import { PlatformDomainsService } from './domains/platform-domains.service';
import { PlatformDomainsRepository } from './domains/platform-domains.repository';
import { HostResolverService } from './domains/host-resolver.service';
import { ConsoleLocationController } from './domains/console-location.controller';
import { DomainSyncService } from './domains/domain-sync.service';
import { DomainVerifyCron } from './domains/domain-verify.cron';

@Module({
  controllers: [
    PlatformDomainsController,
    ConsoleLocationController,
  ],
  providers: [
    PlatformDomainsService,
    PlatformDomainsRepository,
    HostResolverService,
    DomainSyncService,
    DomainVerifyCron,
  ],
  exports: [PlatformDomainsService, HostResolverService],
})
export class InstallationDomainsModule {}
