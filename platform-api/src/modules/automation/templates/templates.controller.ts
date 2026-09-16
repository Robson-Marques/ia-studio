// Catalogo de Templates (diretriz 11) — CRUD + render/preview.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TemplateChannel } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { TemplatesService, extractTemplateVariables } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@ApiTags('Automation — Templates')
@ApiBearerAuth()
@Controller('automation/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_READ)
  findAll(
    @Query('channel') channel?: TemplateChannel,
  ) {
    return this.templates.findAll({ channel });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_READ)
  async findById(
    @Param('id') id: string,
  ) {
    const template = await this.templates.findById(id);
    return { ...template, variables: extractTemplateVariables(`${template.subject ?? ''} ${template.body}`) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  remove(
    @Param('id') id: string,
  ) {
    return this.templates.remove(id);
  }

  /** Preview de render com dados de exemplo. */
  @Post(':id/render')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_READ)
  render(
    @Param('id') id: string,
    @Body() body: { data?: Record<string, unknown> },
  ) {
    return this.templates.render(id, body?.data ?? {});
  }
}
