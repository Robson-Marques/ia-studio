import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ProfilesService } from './profiles.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  // Catalogo (grupos + labels) — precisa vir ANTES de :id na ordem de rotas
  @Get('permissions-catalog')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_READ)
  permissionsCatalog() {
    return this.profiles.permissionsCatalog();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_READ)
  findAll() {
    return this.profiles.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.profiles.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  create(
    @Body() dto: CreateProfileDto,
  ) {
    return this.profiles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  inactivate(
    @Param('id') id: string,
  ) {
    return this.profiles.inactivate(id);
  }
}
