// Flags da instalação e overrides locais. GET /flags/effective resolve pelo
// usuário e perfil autenticados, sem escopo recebido por header.
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
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

  // ─── Administração local da instalação ───────────────
  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Get('administration/flags')
  findAll() {
    return this.flags.findAll();
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Get('administration/flags/:id')
  findById(@Param('id') id: string) {
    return this.flags.findById(id);
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Post('administration/flags')
  create(@Body() dto: CreateFlagDto) {
    return this.flags.create(dto);
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Patch('administration/flags/:id')
  update(@Param('id') id: string, @Body() dto: UpdateFlagDto) {
    return this.flags.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Post('administration/flags/:id/overrides')
  addOverride(@Param('id') id: string, @Body() dto: CreateOverrideDto) {
    return this.flags.addOverride(id, dto);
  }

  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  @Delete('administration/flags/:id/overrides/:overrideId')
  removeOverride(@Param('id') id: string, @Param('overrideId') overrideId: string) {
    return this.flags.removeOverride(id, overrideId);
  }
}
