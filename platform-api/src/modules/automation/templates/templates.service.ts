// Catalogo de Templates multi-canal (diretriz 11): conteudo + {{variaveis}}
// por canal (WhatsApp/Email/SMS/Push/PDF/HTML/Markdown). A automacao
// referencia o template e troca so o canal; o render e generico.
import { Injectable, NotFoundException } from '@nestjs/common';
import { AutomationTemplate, Prisma, TemplateChannel } from '@prisma/client';
import { TemplatesRepository } from './templates.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
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
  ) {}

  findAll(filters: { channel?: TemplateChannel }) {
    return this.repository.findAll(filters);
  }

  async findById(id: string): Promise<AutomationTemplate> {
    const template = await this.repository.findById(id);
    if (!template) throw new NotFoundException('Template não encontrado.');
    return template;
  }

  async create(dto: CreateTemplateDto, createdBy: string | null) {
    const template = await this.repository.create({
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
      newValue: { name: template.name, channel: template.channel },
    });
    return template;
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const before = await this.findById(id);
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
      oldValue: { name: before.name, subject: before.subject },
      newValue: { name: template.name, subject: template.subject },
    });
    return template;
  }

  async remove(id: string) {
    const before = await this.findById(id);
    await this.repository.delete(id);
    await this.audit.record({
      action: 'automation.template.delete',
      entityType: 'AutomationTemplate',
      entityId: id,
      oldValue: { name: before.name, channel: before.channel },
    });
    return { deleted: true };
  }

  /** Render de um template persistido com dados arbitrarios. */
  async render(id: string, data: Record<string, unknown>) {
    const template = await this.findById(id);
    return {
      template_id: template.id,
      channel: template.channel,
      subject: template.subject ? renderTemplateString(template.subject, data) : null,
      body: renderTemplateString(template.body, data),
    };
  }
}
