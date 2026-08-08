import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './organizations.repository';
import { OrgUsersController } from './org-users/org-users.controller';
import { OrgUsersService } from './org-users/org-users.service';
import { OrgUsersRepository } from './org-users/org-users.repository';
import { PlatformDomainsController } from './domains/platform-domains.controller';
import { PlatformDomainsService } from './domains/platform-domains.service';
import { PlatformDomainsRepository } from './domains/platform-domains.repository';
import { HostResolverService } from './domains/host-resolver.service';
import { TenantContextController } from './domains/tenant-context.controller';
import { ConsoleLocationController } from './domains/console-location.controller';
import { DomainSyncService } from './domains/domain-sync.service';
import { DomainVerifyCron } from './domains/domain-verify.cron';

@Module({
  controllers: [
    OrganizationsController,
    OrgUsersController,
    PlatformDomainsController,
    TenantContextController,
    ConsoleLocationController,
  ],
  providers: [
    OrganizationsService,
    OrganizationsRepository,
    OrgUsersService,
    OrgUsersRepository,
    PlatformDomainsService,
    PlatformDomainsRepository,
    HostResolverService,
    DomainSyncService,
    DomainVerifyCron,
  ],
  // HostResolverService exportado para quem precisar do contexto do host
  // (branding do painel, gate por endereco em fase futura).
  exports: [OrganizationsService, PlatformDomainsService, HostResolverService],
})
export class OrganizationsModule {}
