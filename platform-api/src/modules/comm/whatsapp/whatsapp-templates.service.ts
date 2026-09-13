// Catalogo de templates HSM por conexao — BIDIRECIONAL (diretriz 11 +
// spec Wizard Meta): criado no painel → publica na Meta (DRAFT → PENDING);
// criado/alterado na Meta → aparece aqui no sync (status/razao de rejeicao).
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommTemplateStatus, Connection, Prisma, WhatsappTemplate } from '@prisma/client';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { MetaTemplate } from '../../../shared/integration/meta-graph.client';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';

const META_STATUS_MAP: Record<string, CommTemplateStatus> = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  IN_APPEAL: 'PENDING',
  PENDING_DELETION: 'DISABLED',
};

@Injectable()
export class WhatsappTemplatesService {
  private readonly logger = new Logger(WhatsappTemplatesService.name);

  constructor(
    private readonly repository: WhatsappTemplatesRepository,
    private readonly connections: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly audit: AuditLogService,
  ) {}

  list(organizationId: string, connectionId?: string): Promise<WhatsappTemplate[]> {
    return this.repository.list(organizationId, connectionId);
  }

  // ─── CRUD local + vínculo a evento (Checkpoint 1) ───

  /** Detalhe de um template (com checagem de dono). */
  async getById(organizationId: string, id: string): Promise<WhatsappTemplate> {
    const template = await this.repository.findById(id);
    if (!template || template.organization_id !== organizationId) {
      throw new NotFoundException('Template não encontrado.');
    }
    return template;
  }

  /** Edita o conteúdo de um template em rascunho. Publicados se alteram por
   *  push-edit (checkpoint futuro), nunca em silêncio por baixo da Meta. */
  async update(organizationId: string, id: string, dto: UpdateTemplateDto): Promise<WhatsappTemplate> {
    const template = await this.getById(organizationId, id);
    if (template.status !== 'DRAFT') {
      throw new BadRequestException('Só rascunhos podem ser editados aqui. Um template já enviado à Meta se altera por "editar publicado" (checkpoint futuro).');
    }
    const components = this.buildComponents({
      ...dto,
      connection_id: template.connection_id,
      name: template.name,
      language: template.language,
    } as CreateTemplateDto);
    const updated = await this.repository.update(id, { category: dto.category, components: components as never });
    await this.audit.record({
      action: 'comm.whatsapp.template.update',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      newValue: { category: dto.category },
    });
    return updated;
  }

  /** Exclui o template LOCAL. Bloqueia quando ele ainda vive na Meta (remover de
   *  lá é o delete-official — checkpoint futuro), para não deixar órfão. */
  async remove(organizationId: string, id: string): Promise<{ deleted: true }> {
    const template = await this.getById(organizationId, id);
    if (template.meta_template_id && ['APPROVED', 'PENDING', 'PAUSED'].includes(template.status)) {
      throw new BadRequestException('Este template existe na Meta. Remova-o da Meta primeiro (checkpoint futuro) antes de excluí-lo aqui.');
    }
    await this.repository.delete(id);
    await this.audit.record({
      action: 'comm.whatsapp.template.delete',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      oldValue: { name: template.name, language: template.language, status: template.status },
    });
    return { deleted: true };
  }

  /** Liga/desliga o vínculo do template a um evento do sistema (docs-as-code).
   *  É metadado local — vale em qualquer status. event vazio desvincula. */
  async bindEvent(organizationId: string, id: string, event: string | null): Promise<WhatsappTemplate> {
    await this.getById(organizationId, id);
    const normalized = (event ?? '').trim() || null;
    const updated = await this.repository.update(id, { event: normalized });
    await this.audit.record({
      action: 'comm.whatsapp.template.bind',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      newValue: { event: normalized },
    });
    return updated;
  }

  // ─── Operações na Meta (push-edit / delete-official) ──

  /** Edita um template JÁ publicado na Meta e o reenvia para análise (→ PENDING). */
  async pushEdit(organizationId: string, id: string, dto: UpdateTemplateDto): Promise<WhatsappTemplate> {
    const template = await this.getById(organizationId, id);
    if (!template.meta_template_id) {
      throw new BadRequestException('Este template ainda não está na Meta — edite o rascunho (PUT); ele publica no envio/sync.');
    }
    const components = this.buildComponents({
      ...dto,
      connection_id: template.connection_id,
      name: template.name,
      language: template.language,
    } as CreateTemplateDto);
    try {
      await this.connections.execute(organizationId, template.connection_id, 'editTemplate', {
        template_id: template.meta_template_id,
        category: dto.category,
        components,
      });
    } catch (e) {
      throw new BadRequestException(`A Meta recusou a edição: ${(e as Error).message}`);
    }
    const updated = await this.repository.update(id, {
      category: dto.category,
      components: components as never,
      status: 'PENDING',
      rejection_reason: null,
      synced_at: new Date(),
    });
    await this.audit.record({
      action: 'comm.whatsapp.template.push_edit',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      newValue: { category: dto.category },
    });
    return updated;
  }

  /** Remove o template da Meta (delete-official) e, em seguida, localmente. */
  async deleteOfficial(organizationId: string, id: string): Promise<{ deleted: true }> {
    const template = await this.getById(organizationId, id);
    if (!template.meta_template_id) {
      throw new BadRequestException('Este template não está na Meta — use a exclusão comum (DELETE).');
    }
    try {
      await this.connections.execute(organizationId, template.connection_id, 'deleteTemplate', {
        name: template.name,
        hsm_id: template.meta_template_id,
      });
    } catch (e) {
      throw new BadRequestException(`A Meta recusou a exclusão: ${(e as Error).message}`);
    }
    await this.repository.delete(id);
    await this.audit.record({
      action: 'comm.whatsapp.template.delete_official',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      oldValue: { name: template.name, language: template.language, meta_template_id: template.meta_template_id },
    });
    return { deleted: true };
  }

  // ─── Reuso: duplicar / replicar (local, como rascunho) ──

  /** Duplica um template na MESMA conexão como rascunho, com nome único. */
  async duplicate(organizationId: string, id: string): Promise<WhatsappTemplate> {
    const src = await this.getById(organizationId, id);
    const name = await this.uniqueCopyName(src.connection_id, src.name, src.language);
    const copy = await this.repository.create(this.buildCopy(src, {
      connectionId: src.connection_id,
      workspaceId: src.workspace_id,
      environmentId: src.environment_id,
    }, name));
    await this.audit.record({
      action: 'comm.whatsapp.template.duplicate',
      entityType: 'WhatsappTemplate',
      entityId: copy.id,
      organizationId,
      newValue: { from: src.id, name },
    });
    return copy;
  }

  /** Replica um template como RASCUNHO em outras conexões WhatsApp da org. Não
   *  publica na Meta — o destino publica/sincroniza depois. Pula onde já existe. */
  async replicate(
    organizationId: string,
    id: string,
    connectionIds: string[],
  ): Promise<Array<{ connection_id: string; success: boolean; shared?: boolean; template_id?: string; message: string }>> {
    const src = await this.getById(organizationId, id);
    const results: Array<{ connection_id: string; success: boolean; shared?: boolean; template_id?: string; message: string }> = [];
    for (const targetId of Array.from(new Set(connectionIds ?? []))) {
      if (targetId === src.connection_id) {
        results.push({ connection_id: targetId, success: true, shared: true, message: 'É a conexão de origem — o template já está aqui.' });
        continue;
      }
      let target: Connection;
      try {
        target = await this.loadConnection(organizationId, targetId);
      } catch {
        results.push({ connection_id: targetId, success: false, message: 'Conexão WhatsApp não encontrada.' });
        continue;
      }
      const existing = await this.repository.findByName(target.id, src.name, src.language);
      if (existing) {
        results.push({ connection_id: targetId, success: true, shared: true, template_id: existing.id, message: 'Já existe um template com este nome/idioma nesta conexão.' });
        continue;
      }
      const created = await this.repository.create(this.buildCopy(src, {
        connectionId: target.id,
        workspaceId: target.workspace_id,
        environmentId: target.environment_id,
      }, src.name));
      results.push({ connection_id: targetId, success: true, template_id: created.id, message: 'Rascunho criado — publique/sincronize para enviar à Meta.' });
    }
    await this.audit.record({
      action: 'comm.whatsapp.template.replicate',
      entityType: 'WhatsappTemplate',
      entityId: id,
      organizationId,
      newValue: { targets: connectionIds },
    });
    return results;
  }

  /** Nome de cópia único na conexão: `<nome>_copia`, `_copia2`, ... */
  private async uniqueCopyName(connectionId: string, baseName: string, language: string): Promise<string> {
    const base = `${baseName}_copia`;
    let name = base;
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await this.repository.findByName(connectionId, name, language)) {
      name = `${base}${n}`;
      n += 1;
    }
    return name;
  }

  private buildCopy(
    src: WhatsappTemplate,
    target: { connectionId: string; workspaceId: string; environmentId: string },
    name: string,
  ): Prisma.WhatsappTemplateUncheckedCreateInput {
    return {
      organization_id: src.organization_id,
      workspace_id: target.workspaceId,
      environment_id: target.environmentId,
      connection_id: target.connectionId,
      name,
      language: src.language,
      category: src.category,
      status: 'DRAFT',
      components: src.components as never,
      is_system_template: false,
      event: src.event,
      buttons_json: src.buttons_json as never,
      variable_map_json: src.variable_map_json as never,
    };
  }

  // ─── Criacao local + publicacao na Meta ─────────────

  async create(organizationId: string, dto: CreateTemplateDto, createdBy: string | null): Promise<WhatsappTemplate> {
    const connection = await this.loadConnection(organizationId, dto.connection_id);
    const language = dto.language ?? 'pt_BR';

    const existing = await this.repository.findByName(connection.id, dto.name, language);
    if (existing) throw new BadRequestException('Já existe um template com este nome/idioma nesta conexão.');

    const components = this.buildComponents(dto);
    let template = await this.repository.create({
      organization_id: organizationId,
      workspace_id: connection.workspace_id,
      environment_id: connection.environment_id,
      connection_id: connection.id,
      name: dto.name,
      language,
      category: dto.category,
      status: 'DRAFT',
      components: components as never,
      created_by: createdBy,
    });

    // Publica na Meta na hora (bidirecional). Falhou → fica DRAFT + erro pt-BR.
    try {
      const result = (await this.connections.execute(organizationId, connection.id, 'createTemplate', {
        name: dto.name,
        language,
        category: dto.category,
        components,
      })) as { id?: string; status?: string };
      template = await this.repository.update(template.id, {
        status: META_STATUS_MAP[(result.status ?? 'PENDING').toUpperCase()] ?? 'PENDING',
        meta_template_id: result.id ?? null,
        synced_at: new Date(),
      });
    } catch (e) {
      this.logger.warn(`Publicação do template "${dto.name}" falhou: ${(e as Error).message}`);
      throw new BadRequestException(
        `Template salvo como rascunho, mas a publicação na Meta falhou: ${(e as Error).message}`,
      );
    } finally {
      await this.audit.record({
        action: 'comm.whatsapp.template.create',
        entityType: 'WhatsappTemplate',
        entityId: template.id,
        organizationId,
        newValue: { name: dto.name, language, category: dto.category, status: template.status },
      });
    }
    return template;
  }

  // ─── Sync bidirecional (pull Meta → local; push DRAFTs locais) ──────

  async sync(organizationId: string, connectionId: string): Promise<{ pulled: number; pushed: number }> {
    const connection = await this.loadConnection(organizationId, connectionId);
    return this.syncConnection(connection);
  }

  /** Usado tambem pelo cron de sync (~10 min). */
  async syncConnection(connection: Connection): Promise<{ pulled: number; pushed: number }> {
    const organizationId = connection.organization_id;

    // 1) PUSH: rascunhos locais que ainda nao chegaram na Meta.
    let pushed = 0;
    const drafts = await this.repository.listDrafts(connection.id);
    for (const draft of drafts) {
      try {
        const result = (await this.connections.execute(organizationId, connection.id, 'createTemplate', {
          name: draft.name,
          language: draft.language,
          category: draft.category,
          components: draft.components,
        })) as { id?: string; status?: string };
        await this.repository.update(draft.id, {
          status: META_STATUS_MAP[(result.status ?? 'PENDING').toUpperCase()] ?? 'PENDING',
          meta_template_id: result.id ?? null,
          synced_at: new Date(),
        });
        pushed++;
      } catch (e) {
        this.logger.warn(`Push do rascunho "${draft.name}" falhou: ${(e as Error).message}`);
      }
    }

    // 2) PULL: catalogo da WABA → upsert local.
    const metaTemplates = (await this.connections.execute(
      organizationId,
      connection.id,
      'listTemplates',
      {},
    )) as MetaTemplate[];
    let pulled = 0;
    for (const t of metaTemplates) {
      if (!t?.name || !t?.language) continue;
      await this.repository.upsertFromMeta({
        organizationId,
        workspaceId: connection.workspace_id,
        environmentId: connection.environment_id,
        connectionId: connection.id,
        name: t.name,
        language: t.language,
        category: t.category ?? 'UTILITY',
        status: META_STATUS_MAP[(t.status ?? 'PENDING').toUpperCase()] ?? 'PENDING',
        components: Array.isArray(t.components) ? t.components : [],
        metaTemplateId: t.id ?? null,
        rejectionReason: t.rejected_reason ?? null,
      });
      pulled++;
    }
    return { pulled, pushed };
  }

  countByConnection(connectionId: string): Promise<number> {
    return this.repository.countByConnection(connectionId);
  }

  // ─── Helpers privados ───────────────────────────────

  /** Componentes no formato Meta a partir dos campos basicos do form. */
  private buildComponents(dto: CreateTemplateDto): unknown[] {
    const components: unknown[] = [];
    // Só UM cabeçalho por template: mídia (com handle) tem precedência sobre texto.
    if (dto.header_format && dto.header_handle) {
      components.push({
        type: 'HEADER',
        format: dto.header_format,
        example: { header_handle: [dto.header_handle] },
      });
    } else if (dto.header_text) {
      components.push({ type: 'HEADER', format: 'TEXT', text: dto.header_text });
    }
    const body: Record<string, unknown> = { type: 'BODY', text: dto.body_text };
    if (dto.body_examples?.length) {
      body['example'] = { body_text: [dto.body_examples] };
    }
    components.push(body);
    if (dto.footer_text) {
      components.push({ type: 'FOOTER', text: dto.footer_text });
    }
    if (dto.buttons?.length) {
      components.push({
        type: 'BUTTONS',
        buttons: dto.buttons.map((b) => ({
          type: b.type,
          text: b.text,
          ...(b.type === 'URL' && b.url ? { url: b.url } : {}),
          ...(b.type === 'PHONE_NUMBER' && b.phone_number ? { phone_number: b.phone_number } : {}),
        })),
      });
    }
    return components;
  }

  /** Sobe a mídia de EXEMPLO do cabeçalho (via provider → upload resumível da
   *  Meta) e devolve o handle + o formato inferido do mime. O handle vai no DTO
   *  de criar/editar como header_handle + header_format. */
  async uploadHeaderMedia(
    organizationId: string,
    connectionId: string,
    file: { data: Buffer; mimeType: string; filename: string },
  ): Promise<{ handle: string; format: 'IMAGE' | 'VIDEO' | 'DOCUMENT' }> {
    await this.loadConnection(organizationId, connectionId);
    const mime = file.mimeType || '';
    const format: 'IMAGE' | 'VIDEO' | 'DOCUMENT' = mime.startsWith('image/')
      ? 'IMAGE'
      : mime.startsWith('video/')
        ? 'VIDEO'
        : 'DOCUMENT';
    const res = (await this.connections.execute(organizationId, connectionId, 'uploadTemplateMedia', {
      data: file.data,
      mime_type: mime,
      filename: file.filename,
    })) as { handle?: string };
    if (!res?.handle) {
      throw new BadRequestException('A Meta não retornou o handle da mídia — tente novamente.');
    }
    return { handle: res.handle, format };
  }

  private async loadConnection(organizationId: string, connectionId: string): Promise<Connection> {
    const connection = await this.connectionsRepository.findById(connectionId);
    if (!connection || connection.organization_id !== organizationId || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return connection;
  }
}
