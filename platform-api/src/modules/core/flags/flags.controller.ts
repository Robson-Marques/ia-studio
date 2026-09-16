// Flags da instalação e overrides locais. GET /flags/effective resolve pelo
// usuário e perfil autenticados, sem escopo recebido por header.
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InstallationAdminOnly } from '../../../shared/auth/permissions.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { CreateOverrideDto } from './dto/create-override.dto';

@ApiTags('Feature Flags')
@ApiBearerAuth()
@Controller()
export class FlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  // ─── Avaliacao pro ator logado ──────────────────────
  @Get('flags/effective')
  effective(@CurrentUser() user: AuthenticatedUser) {
    return this.flags.effectiveFor({
      userId: user.sub,
      profileId: user.profile_id,
    });
  }

  // ─── Console (globais) ──────────────────────────────
  @InstallationAdminOnly()
  @Get('console/flags')
  findAll() {
    return this.flags.findAll();
  }

  @InstallationAdminOnly()
  @Get('console/flags/:id')
  findById(@Param('id') id: string) {
    return this.flags.findById(id);
  }

  @InstallationAdminOnly()
  @Post('console/flags')
  create(@Body() dto: CreateFlagDto) {
    return this.flags.create(dto);
  }

  @InstallationAdminOnly()
  @Patch('console/flags/:id')
  update(@Param('id') id: string, @Body() dto: UpdateFlagDto) {
    return this.flags.update(id, dto);
  }

  @InstallationAdminOnly()
  @Post('console/flags/:id/overrides')
  addOverride(@Param('id') id: string, @Body() dto: CreateOverrideDto) {
    return this.flags.addOverride(id, dto);
  }

  @InstallationAdminOnly()
  @Delete('console/flags/:id/overrides/:overrideId')
  removeOverride(@Param('id') id: string, @Param('overrideId') overrideId: string) {
    return this.flags.removeOverride(id, overrideId);
  }
}
