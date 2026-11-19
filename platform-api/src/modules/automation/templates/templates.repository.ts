// Porta unica ao banco do catalogo de templates (automation_templates).
import { Injectable } from '@nestjs/common';
import { Prisma, TemplateChannel } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { channel?: TemplateChannel } = {}) {
    const where: Prisma.AutomationTemplateWhereInput = {};
    if (filters.channel) where.channel = filters.channel;
    return this.prisma.automationTemplate.findMany({ where, orderBy: { updated_at: 'desc' } });
  }

  findById(id: string) {
    return this.prisma.automationTemplate.findUnique({ where: { id } });
  }

  create(data: Prisma.AutomationTemplateUncheckedCreateInput) {
    return this.prisma.automationTemplate.create({ data });
  }

  update(id: string, data: Prisma.AutomationTemplateUpdateInput) {
    return this.prisma.automationTemplate.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.automationTemplate.delete({ where: { id } });
  }
}
