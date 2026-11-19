// Memoria — perfis (CRUD) + navegacao de entradas (read-only pelo painel).
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { MemoryService } from './memory.service';
import { CreateMemoryProfileDto, UpdateMemoryProfileDto } from './dto/memory.dtos';

@ApiTags('IA — Memória')
@ApiBearerAuth()
@Controller('ai/memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get('profiles')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_READ)
  listProfiles(
  ) {
    return this.memory.findProfiles();
  }

  @Post('profiles')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_WRITE)
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemoryProfileDto,
  ) {
    return this.memory.createProfile(dto, user.sub);
  }

  @Patch('profiles/:id')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_WRITE)
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateMemoryProfileDto,
  ) {
    return this.memory.updateProfile(id, dto);
  }

  @Get('profiles/:id/entries')
  @RequirePermissions(PERMISSIONS.AI_MEMORY_READ)
  listEntries(
    @Param('id') id: string,
    @Query('scope_key') scopeKey?: string,
  ) {
    return this.memory.listEntries(id, scopeKey);
  }
}
