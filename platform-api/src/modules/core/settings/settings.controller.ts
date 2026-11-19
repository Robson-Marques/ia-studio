import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { SettingsService } from './settings.service';
import { SetSettingDto } from './dto/set-setting.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  findAll() {
    return this.settings.findAll();
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  findByKey(
    @Param('key') key: string,
  ) {
    return this.settings.findByKey(key);
  }

  @Put(':key')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_WRITE)
  set(
    @Param('key') key: string,
    @Body() dto: SetSettingDto,
  ) {
    return this.settings.set(key, dto.value);
  }
}
