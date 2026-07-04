// Console — gestao de licencas: ativar, trocar plano/status, gerar nova chave.
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../shared/auth/platform-admin.guard';
import { LicensesService } from './licenses.service';
import { UpdateLicenseDto } from './dto/update-license.dto';

@ApiTags('Console — Licensing')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/licenses')
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  findAll() {
    return this.licenses.findAll();
  }

  // O Console passa o id da ORGANIZATION (tem o org na tela de detalhe do
  // cliente, nao o id da licenca) — os endpoints resolvem a licenca pela org.
  @Get(':orgId')
  findByOrg(@Param('orgId') orgId: string) {
    return this.licenses.findByOrg(orgId);
  }

  @Post(':orgId/activate')
  activate(@Param('orgId') orgId: string) {
    return this.licenses.activateByOrg(orgId);
  }

  @Patch(':orgId')
  update(@Param('orgId') orgId: string, @Body() dto: UpdateLicenseDto) {
    return this.licenses.updateByOrg(orgId, dto);
  }

  @Post(':orgId/regenerate-key')
  regenerateKey(@Param('orgId') orgId: string) {
    return this.licenses.regenerateKeyByOrg(orgId);
  }
}
