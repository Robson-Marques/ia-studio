// Porta unica ao banco de comm_whatsapp_templates.
import { Injectable } from '@nestjs/common';
import { CommTemplateStatus, Prisma, WhatsappTemplate } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class WhatsappTemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string, connectionId?: string): Promise<WhatsappTemplate[]> {
    return this.prisma.whatsappTemplate.findMany({
      where: {
        organization_id: organizationId,
        ...(connectionId ? { connection_id: connectionId } : {}),
      },
      orderBy: [{ name: 'asc' }, { language: 'asc' }],
    });
  }

  findById(id: string): Promise<WhatsappTemplate | null> {
    return this.prisma.whatsappTemplate.findUnique({ where: { id } });
  }

  findByName(connectionId: string, name: string, language: string): Promise<WhatsappTemplate | null> {
    return this.prisma.whatsappTemplate.findUnique({
      where: { connection_id_name_language: { connection_id: connectionId, name, language } },
    });
  }

  create(data: Prisma.WhatsappTemplateUncheckedCreateInput): Promise<WhatsappTemplate> {
    return this.prisma.whatsappTemplate.create({ data });
  }

  update(id: string, data: Prisma.WhatsappTemplateUpdateInput): Promise<WhatsappTemplate> {
    return this.prisma.whatsappTemplate.update({ where: { id }, data });
  }

  delete(id: string): Promise<WhatsappTemplate> {
    return this.prisma.whatsappTemplate.delete({ where: { id } });
  }

  /** Upsert usado pelo sync (Meta → IA Studio). */
  upsertFromMeta(input: {
    organizationId: string;
    workspaceId: string;
    environmentId: string;
    connectionId: string;
    name: string;
    language: string;
    category: string;
    status: CommTemplateStatus;
    components: unknown[];
    metaTemplateId?: string | null;
    rejectionReason?: string | null;
  }): Promise<WhatsappTemplate> {
    const now = new Date();
    return this.prisma.whatsappTemplate.upsert({
      where: {
        connection_id_name_language: {
          connection_id: input.connectionId,
          name: input.name,
          language: input.language,
        },
      },
      create: {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        environment_id: input.environmentId,
        connection_id: input.connectionId,
        name: input.name,
        language: input.language,
        category: input.category,
        status: input.status,
        components: input.components as Prisma.InputJsonValue,
        meta_template_id: input.metaTemplateId ?? null,
        rejection_reason: input.rejectionReason ?? null,
        synced_at: now,
      },
      update: {
        category: input.category,
        status: input.status,
        components: input.components as Prisma.InputJsonValue,
        meta_template_id: input.metaTemplateId ?? null,
        rejection_reason: input.rejectionReason ?? null,
        synced_at: now,
      },
    });
  }

  async updateStatusByName(
    connectionId: string,
    name: string,
    language: string,
    status: CommTemplateStatus,
    rejectionReason?: string | null,
  ): Promise<number> {
    const result = await this.prisma.whatsappTemplate.updateMany({
      where: { connection_id: connectionId, name, language },
      data: { status, rejection_reason: rejectionReason ?? null, synced_at: new Date() },
    });
    return result.count;
  }

  listDrafts(connectionId: string): Promise<WhatsappTemplate[]> {
    return this.prisma.whatsappTemplate.findMany({
      where: { connection_id: connectionId, status: 'DRAFT' },
    });
  }

  countByConnection(connectionId: string): Promise<number> {
    return this.prisma.whatsappTemplate.count({ where: { connection_id: connectionId } });
  }
}
