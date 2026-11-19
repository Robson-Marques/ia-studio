// Templates HSM — lista/detalhe, criacao (publica na Meta), edicao de rascunho,
// exclusao, vinculo a evento e sync manual.
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
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
    @Query('connection_id') connectionId?: string,
  ) {
    return this.templates.list(connectionId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  create(
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templates.create(dto, null);
  }

  @Post('sync')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  sync(
    @Body() dto: SyncTemplatesDto,
  ) {
    return this.templates.sync(dto.connection_id);
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
    @Req() req: FastifyRequest,
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

    return this.templates.uploadHeaderMedia(connectionId, {
      data: buffer,
      mimeType: data.mimetype || 'application/octet-stream',
      filename: data.filename || 'amostra',
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ)
  getById(
    @Param('id') id: string,
  ) {
    return this.templates.getById(id);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  remove(
    @Param('id') id: string,
  ) {
    return this.templates.remove(id);
  }

  @Post(':id/bind')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  bind(
    @Param('id') id: string,
    @Body() dto: BindTemplateEventDto,
  ) {
    return this.templates.bindEvent(id, dto.event ?? null);
  }

  @Post(':id/duplicate')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  duplicate(
    @Param('id') id: string,
  ) {
    return this.templates.duplicate(id);
  }

  @Post(':id/replicate')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  replicate(
    @Param('id') id: string,
    @Body() dto: ReplicateTemplateDto,
  ) {
    return this.templates.replicate(id, dto.connection_ids);
  }

  @Post(':id/push-edit')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  pushEdit(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templates.pushEdit(id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  publish(@Param('id') id: string) {
    return this.templates.publishDraft(id);
  }

  @Post(':id/delete-official')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE)
  deleteOfficial(
    @Param('id') id: string,
  ) {
    return this.templates.deleteOfficial(id);
  }
}
