// Marketplace (painel do cliente): catalogo com flag installed + instalar/
// desinstalar. Fluxo 100% online (diretriz 43).
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProviderCategory } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { MarketplaceService } from './marketplace.service';

@ApiTags('Integrations — Marketplace')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MARKETPLACE_READ)
  catalog(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: ProviderCategory,
    @Query('search') search?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.marketplace.catalog(resolveOrganizationId(user, orgQuery), { category, search });
  }

  @Post(':key/install')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MARKETPLACE_MANAGE)
  install(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.marketplace.install(resolveOrganizationId(user, orgQuery), key, user.sub);
  }

  @Post(':key/uninstall')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MARKETPLACE_MANAGE)
  uninstall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.marketplace.uninstall(resolveOrganizationId(user, orgQuery), key);
  }
}
