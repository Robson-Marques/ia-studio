// Templates HSM — lista por conexao, criacao (publica na Meta) e sync manual.
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
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
}
