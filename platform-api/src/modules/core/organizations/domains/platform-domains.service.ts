// Registro de dominios/subdominios da instalacao (fase 1 da frente de tenancy).
// Responsabilidade: CADASTRO e ESTADO — quem atende em qual host. NAO resolve
// tenant por Host (fase 2) e NAO toca Nginx/TLS (fronteira app↔infra; a emissao
// de certificado e a fase 4, fora do deploy por tag).
//
// Dois escopos no mesmo registro:
//   * PLATFORM     — hosts da propria plataforma (Console, API, painel base);
//   * ORGANIZATION — hosts de cliente (subdominio no base ou dominio proprio).
// SUBDOMAIN = filho do dominio-base (coberto por wildcard); CUSTOM = dominio
// proprio (exige verificacao de posse + certificado por dominio).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DomainKind, DomainScope, DomainStatus, DomainSurface, PlatformDomain } from '@prisma/client';
import { PlatformDomainsRepository } from './platform-domains.repository';
import { HostResolverService } from './host-resolver.service';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildSubdomain,
  generateVerifyToken,
  isSubdomainOf,
  isValidHostname,
  isValidLabel,
  normalizeHostname,
} from './platform-domains.helpers';
import { CreateDomainDto, UpdateDomainDto } from './dto/platform-domains.dtos';

@Injectable()
export class PlatformDomainsService {
  private readonly logger = new Logger(PlatformDomainsService.name);

  constructor(
    private readonly repository: PlatformDomainsRepository,
    private readonly hostResolver: HostResolverService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Dominio-base ───────────────────────────────────────────────────

  getBaseDomain() {
    return this.repository.getBaseDomain();
  }

  async setBaseDomain(raw: string): Promise<{ base_domain: string }> {
    const base = normalizeHostname(raw);
    if (!isValidHostname(base)) {
      throw new BadRequestException('Domínio-base inválido (ex.: app.suaempresa.com.br).');
    }
    const before = await this.repository.getBaseDomain();
    await this.repository.setBaseDomain(base);
    await this.audit.record({
      action: 'core.platform_domain.set_base',
      entityType: 'SystemSetting',
      oldValue: before ? { base_domain: before } : null,
      newValue: { base_domain: base },
    });
    this.logger.log(`Domínio-base da instalação definido: ${base}`);
    return { base_domain: base };
  }

  // ─── Leitura ────────────────────────────────────────────────────────

  list(filters: { organizationId?: string | null; scope?: DomainScope; status?: DomainStatus } = {}) {
    return this.repository.findAll(filters);
  }

  async findById(id: string): Promise<PlatformDomain> {
    const domain = await this.repository.findById(id);
    if (!domain) throw new NotFoundException('Domínio não encontrado.');
    return domain;
  }

  // ─── Cadastro ───────────────────────────────────────────────────────

  async create(dto: CreateDomainDto, createdBy: string | null) {
    const organizationId = dto.organization_id ?? null;
    const surface = (dto.surface ?? 'ADMIN') as DomainSurface;
    const scope: DomainScope = organizationId ? DomainScope.ORGANIZATION : DomainScope.PLATFORM;

    if (organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!org) throw new BadRequestException('Organização inválida.');
    }

    const hostname = await this.resolveHostname(dto);
    if (!isValidHostname(hostname)) {
      throw new BadRequestException('Endereço inválido. Use um domínio completo (ex.: painel.suaempresa.com.br).');
    }

    const taken = await this.repository.findByHostname(hostname);
    if (taken) throw new ConflictException('Este endereço já está cadastrado.');

    // SUBDOMAIN quando esta sob o dominio-base; senao e dominio proprio (CUSTOM),
    // que nasce exigindo verificacao de posse.
    const base = await this.repository.getBaseDomain();
    const kind = base && isSubdomainOf(hostname, base) ? DomainKind.SUBDOMAIN : DomainKind.CUSTOM;

    // Primeiro host do escopo/superficie vira primario sozinho.
    const existing = await this.repository.countBySurface(organizationId, surface);
    const isPrimary = dto.is_primary === true || existing === 0;

    const domain = await this.repository.create({
      organization_id: organizationId,
      hostname,
      scope,
      surface,
      kind,
      is_primary: false, // definido abaixo via setPrimary (mantem 1 por escopo)
      status: DomainStatus.PENDING_DNS,
      verify_token: kind === DomainKind.CUSTOM ? generateVerifyToken() : null,
      notes: dto.notes ?? null,
      created_by: createdBy,
    });
    if (isPrimary) await this.repository.setPrimary(domain.id, organizationId, surface);

    await this.audit.record({
      action: 'core.platform_domain.create',
      entityType: 'PlatformDomain',
      entityId: domain.id,
      organizationId: organizationId ?? undefined,
      newValue: { hostname, scope, surface, kind, is_primary: isPrimary },
    });
    this.hostResolver.invalidate(hostname);
    this.logger.log(`Domínio cadastrado: ${hostname} (${scope}/${surface}/${kind}).`);
    return this.findById(domain.id);
  }

  async update(id: string, dto: UpdateDomainDto) {
    const before = await this.findById(id);
    const domain = await this.repository.update(id, {
      ...(dto.surface !== undefined ? { surface: dto.surface as DomainSurface } : {}),
      ...(dto.status !== undefined ? { status: dto.status as DomainStatus } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
    });
    await this.audit.record({
      action: 'core.platform_domain.update',
      entityType: 'PlatformDomain',
      entityId: id,
      organizationId: before.organization_id ?? undefined,
      oldValue: { surface: before.surface, status: before.status },
      newValue: { surface: domain.surface, status: domain.status },
    });
    // Status/superfície mudam o que o host resolve — derruba o cache na hora.
    this.hostResolver.invalidate(before.hostname);
    return domain;
  }

  /** Promove a host canônico do escopo (os irmãos perdem o primário). */
  async setPrimary(id: string) {
    const domain = await this.findById(id);
    const updated = await this.repository.setPrimary(id, domain.organization_id, domain.surface);
    // O primario pode virar host canonico exposto no contexto — nao deixa cache velho.
    this.hostResolver.invalidate();
    await this.audit.record({
      action: 'core.platform_domain.set_primary',
      entityType: 'PlatformDomain',
      entityId: id,
      organizationId: domain.organization_id ?? undefined,
      newValue: { hostname: domain.hostname, surface: domain.surface },
    });
    return updated;
  }

  /**
   * Remove um host do registro. Diferente de entidade com histórico, um host é
   * apontamento: apagar é legítimo. O primário só sai se não houver irmãos —
   * senão o escopo ficaria sem endereço canônico (promova outro antes).
   */
  async remove(id: string) {
    const domain = await this.findById(id);
    if (domain.is_primary) {
      const siblings = await this.repository.countBySurface(domain.organization_id, domain.surface);
      if (siblings > 1) {
        throw new ConflictException(
          'Este é o endereço principal. Defina outro como principal antes de remover.',
        );
      }
    }
    await this.repository.delete(id);
    this.hostResolver.invalidate(domain.hostname);
    await this.audit.record({
      action: 'core.platform_domain.delete',
      entityType: 'PlatformDomain',
      entityId: id,
      organizationId: domain.organization_id ?? undefined,
      oldValue: { hostname: domain.hostname, scope: domain.scope, surface: domain.surface },
    });
    return { ok: true };
  }

  /** hostname explícito, ou montado a partir do label + domínio-base. */
  private async resolveHostname(dto: CreateDomainDto): Promise<string> {
    if (dto.hostname) return normalizeHostname(dto.hostname);
    const label = (dto.label ?? '').trim();
    if (!label) throw new BadRequestException('Informe o endereço completo ou o nome do subdomínio.');
    if (!isValidLabel(label)) {
      throw new BadRequestException('Nome de subdomínio inválido (use letras, números e hífen).');
    }
    const base = await this.repository.getBaseDomain();
    if (!base) {
      throw new BadRequestException(
        'Domínio-base não configurado. Defina o domínio-base da instalação antes de criar subdomínios.',
      );
    }
    return buildSubdomain(label, base);
  }
}
