// Cofre de Segredos — endpoints expoem SOMENTE metadados (id, nome, kind,
// campos, rotated_at). O valor decifrado NUNCA sai por HTTP (diretriz 5).
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { SecretsService } from './secrets.service';
import { RotateSecretDto } from './dto/rotate-secret.dto';

@ApiTags('Integrations — Secrets')
@ApiBearerAuth()
@Controller('secrets')
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_READ)
  findAll() {
    return this.secrets.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.secrets.findViewById(id);
  }

  @Post(':id/rotate')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_SECRETS_MANAGE)
  rotate(
    @Param('id') id: string,
    @Body() dto: RotateSecretDto,
  ) {
    return this.secrets.rotate(id, dto.values);
  }
}
