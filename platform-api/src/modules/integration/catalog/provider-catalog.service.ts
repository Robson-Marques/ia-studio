// Catálogo local de providers: a instalação já embarca as implementações; o
// painel apenas escolhe qual delas configurar como Connection.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProviderDefinition } from '@prisma/client';
import { RegistryRepository } from '../registry/registry.repository';
import { ProviderRegistryService } from '../registry/provider-registry.service';

export type AvailableProvider = Omit<ProviderDefinition, 'is_installed_by_default'>;

@Injectable()
export class ProviderCatalogService {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly registry: ProviderRegistryService,
  ) {}

  /** Providers ativos que têm implementação embarcada nesta instalação. */
  async listAvailable(): Promise<AvailableProvider[]> {
    const definitions = await this.repository.findActiveDefinitions();
    return definitions
      .filter((definition) => this.registry.has(definition.key))
      .map(({ is_installed_by_default: _legacyInstallState, ...definition }) => definition);
  }

  /** Definição válida para criar ou editar uma Connection. */
  async definitionForConnection(providerKey: string): Promise<ProviderDefinition> {
    const definition = await this.repository.findByKey(providerKey);
    if (!definition || !definition.is_active || !this.registry.has(providerKey)) {
      throw new BadRequestException('Conector indisponível nesta instalação.');
    }
    return definition;
  }
}
