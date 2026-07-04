import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
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
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.profiles.findAll(resolveOrganizationId(user, orgQuery));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.profiles.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProfileDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.profiles.create(resolveOrganizationId(user, orgQuery), dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.profiles.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CORE_PROFILES_WRITE)
  inactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.profiles.inactivate(resolveOrganizationId(user, orgQuery), id);
  }
}
