// Templates HSM — lista/detalhe, criacao (publica na Meta), edicao de rascunho,
// exclusao, vinculo a evento e sync manual.
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto, BindTemplateEventDto, ReplicateTemplateDto } from '../dto/update-template.dto';
import { IsUUID } from 'class-validator';

export class SyncTemplatesDto {
  @IsUUID()
  connection_id!: string;
}

@ApiTags('Comm — WhatsApp Templates')
@ApiBearerAuth()
@Controller('comm/whatsapp/templates')
export class WhatsappTemplatesController {
  constructor(private readonly templates: WhatsappTemplatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('connection_id') connectionId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.list(resolveOrganizationId(user, orgQuery), connectionId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Post('sync')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncTemplatesDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.sync(resolveOrganizationId(user, orgQuery), dto.connection_id);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ)
  getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.getById(resolveOrganizationId(user, orgQuery), id);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.remove(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/bind')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  bind(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BindTemplateEventDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.bindEvent(resolveOrganizationId(user, orgQuery), id, dto.event ?? null);
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.duplicate(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/replicate')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  replicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReplicateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.replicate(resolveOrganizationId(user, orgQuery), id, dto.connection_ids);
  }

  @Post(':id/push-edit')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  pushEdit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.pushEdit(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post(':id/delete-official')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  deleteOfficial(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.templates.deleteOfficial(resolveOrganizationId(user, orgQuery), id);
  }
}
