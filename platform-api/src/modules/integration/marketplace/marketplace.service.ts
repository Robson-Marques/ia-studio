// Marketplace de Conectores: catálogo local e instalação/desinstalação por instância.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProviderCategory, ProviderDefinition } from '@prisma/client';
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

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly registry: ProviderRegistryService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Catálogo local ─────────────────────────────────
  async catalog(
    filters: { category?: ProviderCategory; search?: string },
  ): Promise<CatalogItem[]> {
    const [definitions, installs] = await Promise.all([
      this.repository.findDefinitions({ ...filters, onlyActive: true }),
      this.repository.findInstalls(),
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
  async install(providerKey: string, installedBy: string | null) {
    const def = await this.repository.findDefinitionByKey(providerKey);
    if (!def || !def.is_active) {
      throw new NotFoundException('Conector não encontrado no marketplace.');
    }
    const existing = await this.repository.findInstall(providerKey);
    if (existing) {
      throw new ConflictException('Conector já instalado nesta instância.');
    }
    const install = await this.repository.createInstall(providerKey, installedBy);
    await this.audit.record({
      action: 'integration.marketplace.install',
      entityType: 'ProviderInstall',
      entityId: install.id,
      newValue: { provider_key: providerKey },
    });
    return install;
  }

  async uninstall(providerKey: string) {
    const existing = await this.repository.findInstall(providerKey);
    if (!existing) {
      throw new NotFoundException('Conector não está instalado nesta instância.');
    }
    const activeConnections = await this.repository.countActiveConnections(providerKey);
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
      oldValue: { provider_key: providerKey },
    });
    return { uninstalled: true };
  }

  /** Provider instalado (ou default) e ativo? Usado pelo connections. */
  async assertInstalled(providerKey: string): Promise<ProviderDefinition> {
    const def = await this.repository.findDefinitionByKey(providerKey);
    if (!def || !def.is_active) {
      throw new BadRequestException('Conector inexistente ou desativado no marketplace.');
    }
    if (!def.is_installed_by_default) {
      const install = await this.repository.findInstall(providerKey);
      if (!install) {
        throw new BadRequestException('Instale o conector no marketplace antes de criar conexões.');
      }
    }
    return def;
  }

}
