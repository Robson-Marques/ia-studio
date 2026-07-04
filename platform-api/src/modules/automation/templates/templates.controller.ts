// Catalogo de Templates (diretriz 11) — CRUD + render/preview.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TemplateChannel } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
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
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('channel') channel?: TemplateChannel,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.findAll(resolveOrganizationId(user, orgQuery), {
      workspaceId,
      environmentId,
      channel,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_READ)
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const template = await this.templates.findById(resolveOrganizationId(user, orgQuery), id);
    return { ...template, variables: extractTemplateVariables(`${template.subject ?? ''} ${template.body}`) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_WRITE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.remove(resolveOrganizationId(user, orgQuery), id);
  }

  /** Preview de render com dados de exemplo. */
  @Post(':id/render')
  @RequirePermissions(PERMISSIONS.AUTOMATION_TEMPLATES_READ)
  render(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { data?: Record<string, unknown> },
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.render(resolveOrganizationId(user, orgQuery), id, body?.data ?? {});
  }
}
