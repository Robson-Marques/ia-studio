// Catalogo de Templates multi-canal (diretriz 11): conteudo + {{variaveis}}
// por canal (WhatsApp/Email/SMS/Push/PDF/HTML/Markdown). A automacao
// referencia o template e troca so o canal; o render e generico.
import { Injectable, NotFoundException } from '@nestjs/common';
import { AutomationTemplate, Prisma, TemplateChannel } from '@prisma/client';
import { TemplatesRepository } from './templates.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertSameOrg, validateWorkspaceScope } from '../../../shared/auth/tenant.util';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const TOKEN_RE = /\{\{\s*([\w.[\]-]+)\s*\}\}/g;

/** Render puro: substitui {{caminho}} pelos valores de `data` (a.b.c). */
export function renderTemplateString(body: string, data: Record<string, unknown>): string {
  return body.replace(TOKEN_RE, (_m, path: string) => {
    const parts = path.split('.');
    let cur: unknown = data;
    for (const p of parts) {
      if (cur === null || cur === undefined) return '';
      cur = (cur as Record<string, unknown>)[p];
    }
    if (cur === null || cur === undefined) return '';
    return typeof cur === 'object' ? JSON.stringify(cur) : String(cur);
  });
}

/** Variaveis {{...}} presentes num corpo (preview do editor). */
export function extractTemplateVariables(body: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE);
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return Array.from(out);
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly repository: TemplatesRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  findAll(organizationId: string, filters: { workspaceId?: string; environmentId?: string; channel?: TemplateChannel }) {
    return this.repository.findAllByOrg(organizationId, filters);
  }

  async findById(organizationId: string, id: string): Promise<AutomationTemplate> {
    const template = await this.repository.findById(id);
    if (!template) throw new NotFoundException('Template não encontrado.');
    assertSameOrg(template.organization_id, organizationId);
    return template;
  }

  async create(organizationId: string, dto: CreateTemplateDto, createdBy: string | null) {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    const template = await this.repository.create({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id,
      name: dto.name,
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      meta: (dto.meta ?? {}) as Prisma.InputJsonValue,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'automation.template.create',
      entityType: 'AutomationTemplate',
      entityId: template.id,
      organizationId,
      newValue: { name: template.name, channel: template.channel },
    });
    return template;
  }

  async update(organizationId: string, id: string, dto: UpdateTemplateDto) {
    const before = await this.findById(organizationId, id);
    const template = await this.repository.update(id, {
      name: dto.name ?? undefined,
      subject: dto.subject ?? undefined,
      body: dto.body ?? undefined,
      meta: dto.meta === undefined ? undefined : (dto.meta as Prisma.InputJsonValue),
    });
    await this.audit.record({
      action: 'automation.template.update',
      entityType: 'AutomationTemplate',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, subject: before.subject },
      newValue: { name: template.name, subject: template.subject },
    });
    return template;
  }

  async remove(organizationId: string, id: string) {
    const before = await this.findById(organizationId, id);
    await this.repository.delete(id);
    await this.audit.record({
      action: 'automation.template.delete',
      entityType: 'AutomationTemplate',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, channel: before.channel },
    });
    return { deleted: true };
  }

  /** Render de um template persistido com dados arbitrarios. */
  async render(organizationId: string, id: string, data: Record<string, unknown>) {
    const template = await this.findById(organizationId, id);
    return {
      template_id: template.id,
      channel: template.channel,
      subject: template.subject ? renderTemplateString(template.subject, data) : null,
      body: renderTemplateString(template.body, data),
    };
  }
}
