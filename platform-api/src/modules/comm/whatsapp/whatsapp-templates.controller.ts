// Templates HSM — lista/detalhe, criacao (publica na Meta), edicao de rascunho,
// exclusao, vinculo a evento e sync manual.
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
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

  /**
   * Sobe a mídia de EXEMPLO do cabeçalho (multipart/form-data): campos `file` +
   * `connection_id`. Devolve { handle, format } — o front usa no criar/editar
   * template (header_handle + header_format). Exige App ID na conexão.
   */
  @Post('header-media')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  @ApiOperation({ summary: 'Sobe a mídia de exemplo do cabeçalho (multipart/form-data)' })
  async uploadHeaderMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Query('organization_id') orgQuery?: string,
  ) {
    // @fastify/multipart registrado no bootstrap (mesmo padrão do upload de mídia da inbox).
    const reqAny = req as FastifyRequest & {
      isMultipart?: () => boolean;
      file?: () => Promise<
        | {
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
            fields?: Record<string, { value?: string } | Array<{ value?: string }>>;
          }
        | undefined
      >;
    };
    if (typeof reqAny.isMultipart === 'function' && !reqAny.isMultipart()) {
      throw new BadRequestException('Envie o arquivo como multipart/form-data.');
    }
    if (typeof reqAny.file !== 'function') {
      throw new BadRequestException('Upload multipart indisponível (plugin não registrado).');
    }
    const data = await reqAny.file();
    if (!data) throw new BadRequestException('Nenhum arquivo recebido.');

    const readField = (name: string): string | undefined => {
      const f = (data.fields as Record<string, unknown> | undefined)?.[name];
      const single = Array.isArray(f) ? f[0] : f;
      const value = (single as { value?: unknown } | undefined)?.value;
      return typeof value === 'string' ? value : undefined;
    };
    const connectionId = (readField('connection_id') ?? '').trim();
    if (!connectionId) throw new BadRequestException('Campo "connection_id" é obrigatório.');
    const buffer = await data.toBuffer();

    return this.templates.uploadHeaderMedia(resolveOrganizationId(user, orgQuery), connectionId, {
      data: buffer,
      mimeType: data.mimetype || 'application/octet-stream',
      filename: data.filename || 'amostra',
    });
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
