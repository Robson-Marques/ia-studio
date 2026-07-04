// Flags globais e overrides: gestao pelo Console (@PlatformAdminOnly).
// GET /flags/effective: qualquer usuario autenticado resolve as flags pro
// proprio contexto (org do JWT + workspace do header x-workspace-id).
import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../../shared/auth/platform-admin.guard';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser, RequestWithUser } from '../../../shared/auth/auth.types';
import { getWorkspaceIdHeader } from '../../../shared/auth/tenant.util';
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
  effective(@CurrentUser() user: AuthenticatedUser, @Req() req: RequestWithUser) {
    return this.flags.effectiveFor({
      organizationId: user.organization_id,
      workspaceId: getWorkspaceIdHeader(req) ?? null,
      userId: user.sub,
      profileId: user.profile_id,
    });
  }

  // ─── Console (globais) ──────────────────────────────
  @PlatformAdminOnly()
  @Get('console/flags')
  findAll() {
    return this.flags.findAll();
  }

  @PlatformAdminOnly()
  @Get('console/flags/:id')
  findById(@Param('id') id: string) {
    return this.flags.findById(id);
  }

  @PlatformAdminOnly()
  @Post('console/flags')
  create(@Body() dto: CreateFlagDto) {
    return this.flags.create(dto);
  }

  @PlatformAdminOnly()
  @Patch('console/flags/:id')
  update(@Param('id') id: string, @Body() dto: UpdateFlagDto) {
    return this.flags.update(id, dto);
  }

  @PlatformAdminOnly()
  @Post('console/flags/:id/overrides')
  addOverride(@Param('id') id: string, @Body() dto: CreateOverrideDto) {
    return this.flags.addOverride(id, dto);
  }

  @PlatformAdminOnly()
  @Delete('console/flags/:id/overrides/:overrideId')
  removeOverride(@Param('id') id: string, @Param('overrideId') overrideId: string) {
    return this.flags.removeOverride(id, overrideId);
  }
}
