// Marketplace de Conectores (diretrizes 1/43/48): catalogo + instalar/
// desinstalar por organization + curadoria de ProviderDefinition (Console).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProviderCategory, ProviderDefinition } from '@prisma/client';
import { MarketplaceRepository } from './marketplace.repository';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';

export interface CatalogItem {
  id: string;
  key: string;
  name: string;
  category: ProviderCategory;
  description: string;
  icon: string | null;
  wizard_schema: unknown;
  capabilities: unknown;
  is_active: boolean;
  installed: boolean;
  /** false = card visivel mas conexao indisponivel nesta fase (ex.: Meta). */
  has_implementation: boolean;
}

export interface CreateDefinitionInput {
  key: string;
  name: string;
  category: ProviderCategory;
  description: string;
  icon?: string | null;
  wizard_schema: Record<string, unknown>;
  capabilities?: unknown[];
  is_installed_by_default?: boolean;
  is_active?: boolean;
}

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly registry: ProviderRegistryService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Catalogo (painel do cliente) ───────────────────
  async catalog(
    organizationId: string,
    filters: { category?: ProviderCategory; search?: string },
  ): Promise<CatalogItem[]> {
    const [definitions, installs] = await Promise.all([
      this.repository.findDefinitions({ ...filters, onlyActive: true }),
      this.repository.findInstallsByOrg(organizationId),
    ]);
    const installedKeys = new Set(installs.map((i) => i.provider_key));
    return definitions.map((def) => ({
      id: def.id,
      key: def.key,
      name: def.name,
      category: def.category,
      description: def.description,
      icon: def.icon,
      wizard_schema: def.wizard_schema,
      capabilities: def.capabilities,
      is_active: def.is_active,
      installed: def.is_installed_by_default || installedKeys.has(def.key),
      has_implementation: this.registry.has(def.key),
    }));
  }

  // ─── Instalar / desinstalar ─────────────────────────
  async install(organizationId: string, providerKey: string, installedBy: string | null) {
    const def = await this.repository.findDefinitionByKey(providerKey);
    if (!def || !def.is_active) {
      throw new NotFoundException('Conector não encontrado no marketplace.');
    }
    const existing = await this.repository.findInstall(organizationId, providerKey);
    if (existing) {
      throw new ConflictException('Conector já instalado nesta organização.');
    }
    const install = await this.repository.createInstall(organizationId, providerKey, installedBy);
    await this.audit.record({
      action: 'integration.marketplace.install',
      entityType: 'ProviderInstall',
      entityId: install.id,
      organizationId,
      newValue: { provider_key: providerKey },
    });
    return install;
  }

  async uninstall(organizationId: string, providerKey: string) {
    const existing = await this.repository.findInstall(organizationId, providerKey);
    if (!existing) {
      throw new NotFoundException('Conector não está instalado nesta organização.');
    }
    const activeConnections = await this.repository.countActiveConnections(organizationId, providerKey);
    if (activeConnections > 0) {
      throw new ConflictException(
        `Desative as ${activeConnections} conexão(ões) deste conector antes de desinstalar.`,
      );
    }
    await this.repository.deleteInstall(existing.id);
    await this.audit.record({
      action: 'integration.marketplace.uninstall',
      entityType: 'ProviderInstall',
      entityId: existing.id,
      organizationId,
      oldValue: { provider_key: providerKey },
    });
    return { uninstalled: true };
  }

  /** Provider instalado (ou default) e ativo? Usado pelo connections. */
  async assertInstalled(organizationId: string, providerKey: string): Promise<ProviderDefinition> {
    const def = await this.repository.findDefinitionByKey(providerKey);
    if (!def || !def.is_active) {
      throw new BadRequestException('Conector inexistente ou desativado no marketplace.');
    }
    if (!def.is_installed_by_default) {
      const install = await this.repository.findInstall(organizationId, providerKey);
      if (!install) {
        throw new BadRequestException('Instale o conector no marketplace antes de criar conexões.');
      }
    }
    return def;
  }

  // ─── Curadoria (Console — diretriz 43) ──────────────
  findAllDefinitions(filters: { category?: ProviderCategory; search?: string }) {
    return this.repository.findDefinitions(filters);
  }

  async createDefinition(input: CreateDefinitionInput) {
    const existing = await this.repository.findDefinitionByKey(input.key);
    if (existing) throw new ConflictException(`Já existe conector com a key "${input.key}".`);
    const def = await this.repository.createDefinition({
      key: input.key,
      name: input.name,
      category: input.category,
      description: input.description,
      icon: input.icon ?? null,
      wizard_schema: input.wizard_schema as Prisma.InputJsonValue,
      capabilities: (input.capabilities ?? []) as Prisma.InputJsonValue,
      is_installed_by_default: input.is_installed_by_default ?? false,
      is_active: input.is_active ?? true,
    });
    await this.audit.record({
      action: 'integration.provider_definition.create',
      entityType: 'ProviderDefinition',
      entityId: def.id,
      newValue: { key: def.key, name: def.name, category: def.category },
    });
    return def;
  }

  async updateDefinition(id: string, input: Partial<CreateDefinitionInput>) {
    const before = await this.repository.findDefinitionById(id);
    if (!before) throw new NotFoundException('Conector não encontrado.');
    const data: Prisma.ProviderDefinitionUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.category !== undefined) data.category = input.category;
    if (input.description !== undefined) data.description = input.description;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.wizard_schema !== undefined) data.wizard_schema = input.wizard_schema as Prisma.InputJsonValue;
    if (input.capabilities !== undefined) data.capabilities = input.capabilities as Prisma.InputJsonValue;
    if (input.is_installed_by_default !== undefined) data.is_installed_by_default = input.is_installed_by_default;
    if (input.is_active !== undefined) data.is_active = input.is_active;
    const def = await this.repository.updateDefinition(id, data);
    await this.audit.record({
      action: 'integration.provider_definition.update',
      entityType: 'ProviderDefinition',
      entityId: id,
      oldValue: { name: before.name, is_active: before.is_active, category: before.category },
      newValue: { name: def.name, is_active: def.is_active, category: def.category },
    });
    return def;
  }
}
