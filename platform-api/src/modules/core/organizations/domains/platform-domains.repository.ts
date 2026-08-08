// Porta unica ao banco do registro de dominios (core_platform_domains).
// Guarda tambem o DOMINIO-BASE da instalacao, que e config de plataforma
// (system_settings com organization_id NULO — o SettingsService e por-org e
// nao atende este escopo). Fica aqui por coesao: e o dado que define de quem
// os subdominios sao filhos.
import { Injectable } from '@nestjs/common';
import { DomainScope, DomainStatus, DomainSurface, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/** Chave da config de plataforma com o dominio-base dos subdominios. */
export const BASE_DOMAIN_SETTING_KEY = 'platform.base_domain';

@Injectable()
export class PlatformDomainsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Dominio-base da instalacao (config de plataforma) ──────────────

  async getBaseDomain(): Promise<string | null> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { organization_id: null, key: BASE_DOMAIN_SETTING_KEY },
    });
    const v = row?.value;
    return typeof v === 'string' && v ? v : null;
  }

  async setBaseDomain(value: string): Promise<string> {
    // Unique composto com NULL nao e enderecavel por findUnique no Prisma —
    // por isso o par findFirst + create/update (idempotente).
    const row = await this.prisma.systemSetting.findFirst({
      where: { organization_id: null, key: BASE_DOMAIN_SETTING_KEY },
    });
    if (row) {
      await this.prisma.systemSetting.update({ where: { id: row.id }, data: { value: value } });
    } else {
      await this.prisma.systemSetting.create({
        data: { organization_id: null, key: BASE_DOMAIN_SETTING_KEY, value: value },
      });
    }
    return value;
  }

  // ─── Dominios ───────────────────────────────────────────────────────

  findAll(filters: { organizationId?: string | null; scope?: DomainScope; status?: DomainStatus } = {}) {
    const where: Prisma.PlatformDomainWhereInput = {};
    if (filters.organizationId !== undefined) where.organization_id = filters.organizationId;
    if (filters.scope) where.scope = filters.scope;
    if (filters.status) where.status = filters.status;
    return this.prisma.platformDomain.findMany({
      where,
      orderBy: [{ scope: 'asc' }, { is_primary: 'desc' }, { hostname: 'asc' }],
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.platformDomain.findUnique({ where: { id } });
  }

  /** Resolucao por Host (fase 2 consome isto). Só ACTIVE atende de verdade. */
  findByHostname(hostname: string) {
    return this.prisma.platformDomain.findUnique({
      where: { hostname },
      include: { organization: { select: { id: true, name: true, slug: true, branding: true, is_active: true } } },
    });
  }

  create(data: Prisma.PlatformDomainUncheckedCreateInput) {
    return this.prisma.platformDomain.create({ data });
  }

  update(id: string, data: Prisma.PlatformDomainUpdateInput) {
    return this.prisma.platformDomain.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.platformDomain.delete({ where: { id } });
  }

  /**
   * Promove um host a principal do seu escopo, tirando o primario dos irmaos
   * (mesmo organization_id + mesma superficie) numa transacao — nunca ficam dois.
   */
  async setPrimary(id: string, organizationId: string | null, surface: DomainSurface) {
    return this.prisma.$transaction(async (tx) => {
      await tx.platformDomain.updateMany({
        where: { organization_id: organizationId, surface, NOT: { id } },
        data: { is_primary: false },
      });
      return tx.platformDomain.update({ where: { id }, data: { is_primary: true } });
    });
  }

  countBySurface(organizationId: string | null, surface: DomainSurface) {
    return this.prisma.platformDomain.count({ where: { organization_id: organizationId, surface } });
  }
}
