import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CORE_USERS_READ)
  findAll(
    @Query('include_deleted') includeDeleted?: string,
  ) {
    return this.users.findAll(includeDeleted === 'true');
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.users.findById(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ) {
    return this.users.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(id, dto, user.sub);
  }

  // Soft-delete (nunca hard): deleted_at + is_active=false + revogacao de sessao
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CORE_USERS_INACTIVATE)
  inactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.inactivate(id, user.sub);
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.CORE_USERS_WRITE)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.activate(id, user.sub);
  }
}
