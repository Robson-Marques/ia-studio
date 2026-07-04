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

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.licenses.findById(id);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.licenses.activate(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.licenses.update(id, dto);
  }

  @Post(':id/regenerate-key')
  regenerateKey(@Param('id') id: string) {
    return this.licenses.regenerateKey(id);
  }
}
