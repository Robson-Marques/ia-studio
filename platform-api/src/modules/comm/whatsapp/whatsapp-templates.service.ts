// Catalogo de templates HSM por conexao — BIDIRECIONAL (diretriz 11 +
// spec Wizard Meta): criado no painel → publica na Meta (DRAFT → PENDING);
// criado/alterado na Meta → aparece aqui no sync (status/razao de rejeicao).
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommTemplateStatus, Connection, WhatsappTemplate } from '@prisma/client';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { MetaTemplate } from '../../../shared/integration/meta-graph.client';
import { CreateTemplateDto } from '../dto/create-template.dto';

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
    if (dto.header_text) {
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

  private async loadConnection(organizationId: string, connectionId: string): Promise<Connection> {
    const connection = await this.connectionsRepository.findById(connectionId);
    if (!connection || connection.organization_id !== organizationId || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return connection;
  }
}
