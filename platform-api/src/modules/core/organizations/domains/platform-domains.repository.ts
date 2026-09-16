// Porta unica ao banco do registro de dominios (core_platform_domains).
// Guarda também o domínio-base e o toggle de verificação da instalação.
import { Injectable } from '@nestjs/common';
import { DomainStatus, DomainSurface, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/** Chave da config de plataforma com o dominio-base dos subdominios. */
export const BASE_DOMAIN_SETTING_KEY = 'platform.base_domain';

/** Toggle da reverificacao automatica de enderecos (nasce OFF). */
export const AUTO_VERIFY_SETTING_KEY = 'platform.domains.auto_verify';

@Injectable()
export class PlatformDomainsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Dominio-base da instalacao (config de plataforma) ──────────────

  async getBaseDomain(): Promise<string | null> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: BASE_DOMAIN_SETTING_KEY },
    });
    const v = row?.value;
    return typeof v === 'string' && v ? v : null;
  }

  async setBaseDomain(value: string): Promise<string> {
    // Unique composto com NULL nao e enderecavel por findUnique no Prisma —
    // por isso o par findFirst + create/update (idempotente).
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: BASE_DOMAIN_SETTING_KEY },
    });
    if (row) {
      await this.prisma.systemSetting.update({ where: { id: row.id }, data: { value: value } });
    } else {
      await this.prisma.systemSetting.create({
        data: { key: BASE_DOMAIN_SETTING_KEY, value },
      });
    }
    return value;
  }

  // ─── Reverificacao automatica (toggle + fila de pendentes) ──────────

  async isAutoVerifyEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: AUTO_VERIFY_SETTING_KEY },
    });
    return row?.value === true || row?.value === 'true';
  }

  async setAutoVerify(enabled: boolean): Promise<boolean> {
    const row = await this.prisma.systemSetting.findFirst({
      where: { key: AUTO_VERIFY_SETTING_KEY },
    });
    if (row) {
      await this.prisma.systemSetting.update({ where: { id: row.id }, data: { value: enabled } });
    } else {
      await this.prisma.systemSetting.create({
        data: { key: AUTO_VERIFY_SETTING_KEY, value: enabled },
      });
    }
    return enabled;
  }

  /** Enderecos que ainda nao entraram no ar (o que a reverificacao persegue). */
  countPending(): Promise<number> {
    return this.prisma.platformDomain.count({
      where: { status: { in: [DomainStatus.PENDING_DNS, DomainStatus.VERIFYING, DomainStatus.FAILED] } },
    });
  }

  // ─── Dominios ───────────────────────────────────────────────────────

  findAll(filters: { status?: DomainStatus } = {}) {
    const where: Prisma.PlatformDomainWhereInput = {};
    if (filters.status) where.status = filters.status;
    return this.prisma.platformDomain.findMany({
      where,
      orderBy: [{ is_primary: 'desc' }, { hostname: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.platformDomain.findUnique({ where: { id } });
  }

  /** Resolucao por Host (fase 2 consome isto). Só ACTIVE atende de verdade. */
  findByHostname(hostname: string) {
    return this.prisma.platformDomain.findUnique({
      where: { hostname },
    });
  }

  /**
   * Endereco CANONICO do Console: host ACTIVE de superficie CONSOLE (o marcado
   * como principal ganha). Null = Console nao tem endereco dedicado, entao ele
   * continua atendendo pelo caminho /console/ do dominio principal.
   */
  findCanonicalConsole() {
    return this.prisma.platformDomain.findFirst({
      where: { surface: DomainSurface.CONSOLE, status: DomainStatus.ACTIVE },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      select: { hostname: true },
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
   * Promove um host a principal da superfície local, sem permitir duplicidade.
   */
  async setPrimary(id: string, surface: DomainSurface) {
    return this.prisma.$transaction(async (tx) => {
      await tx.platformDomain.updateMany({
        where: { surface, NOT: { id } },
        data: { is_primary: false },
      });
      return tx.platformDomain.update({ where: { id }, data: { is_primary: true } });
    });
  }

  countBySurface(surface: DomainSurface) {
    return this.prisma.platformDomain.count({ where: { surface } });
  }
}
