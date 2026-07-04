// "Minha Conta" (diretriz 42) — visao da propria org: plano, licenca,
// limites efetivos e consumo do mes.
import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser, RequestWithUser } from '../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../shared/auth/tenant.util';
import { LimitsService } from './limits.service';
import { UsageService } from './usage.service';
import { LicensingRepository } from './licensing.repository';

@ApiTags('Minha Conta')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly repository: LicensingRepository,
  ) {}

  @Get('license')
  @RequirePermissions(PERMISSIONS.LICENSE_READ, PERMISSIONS.ACCOUNT_READ)
  async license(@CurrentUser() user: AuthenticatedUser, @Req() req: RequestWithUser) {
    const orgId = resolveOrganizationId(user, req.query?.['organization_id'] as string | undefined);
    const license = await this.repository.findLicenseByOrg(orgId);
    const effective = await this.limits.getEffective(orgId);
    const usage = await this.usage.getUsage(orgId);
    return {
      license: license
        ? {
            status: license.status,
            license_key: license.license_key,
            activated_at: license.activated_at,
            expires_at: license.expires_at,
            trial_ends_at: license.trial_ends_at,
          }
        : null,
      plan: { id: effective.planId, name: effective.planName, features: effective.features },
      limits: effective.limits,
      usage,
    };
  }
}
