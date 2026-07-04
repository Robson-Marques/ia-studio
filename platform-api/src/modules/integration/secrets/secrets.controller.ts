// Cofre de Segredos — endpoints expoem SOMENTE metadados (id, nome, kind,
// campos, rotated_at). O valor decifrado NUNCA sai por HTTP (diretriz 5).
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { SecretsService } from './secrets.service';
import { RotateSecretDto } from './dto/rotate-secret.dto';

@ApiTags('Integrations — Secrets')
@ApiBearerAuth()
@Controller('secrets')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.secrets.findAll(resolveOrganizationId(user, orgQuery));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.secrets.findViewById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/rotate')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_MANAGE)
  rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RotateSecretDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.secrets.rotate(resolveOrganizationId(user, orgQuery), id, dto.values);
  }
}
