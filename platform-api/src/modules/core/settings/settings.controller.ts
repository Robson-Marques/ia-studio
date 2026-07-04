import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { SettingsService } from './settings.service';
import { SetSettingDto } from './dto/set-setting.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.settings.findAll(resolveOrganizationId(user, orgQuery));
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  findByKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.settings.findByKey(resolveOrganizationId(user, orgQuery), key);
  }

  @Put(':key')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_WRITE)
  set(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: SetSettingDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.settings.set(resolveOrganizationId(user, orgQuery), key, dto.value);
  }
}
