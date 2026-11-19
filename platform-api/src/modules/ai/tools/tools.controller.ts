// Catalogo de ferramentas (ai_tools): listar + CRUD das custom.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ToolsService } from './tools.service';
import { CreateToolDto, UpdateToolDto } from './dto/tools.dtos';

@ApiTags('IA — Ferramentas')
@ApiBearerAuth()
@Controller('ai/tools')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_TOOLS_READ)
  findAll(
    @Query('only_active') onlyActive?: string,
  ) {
    return this.tools.findAll(onlyActive === 'true');
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_TOOLS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateToolDto,
  ) {
    return this.tools.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_TOOLS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateToolDto,
  ) {
    return this.tools.update(id, dto);
  }
}
