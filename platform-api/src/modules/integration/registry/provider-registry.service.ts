// Provider Registry (diretriz 2): registro central em memoria das
// implementacoes IProvider por key. Proibido switch por provider_key
// espalhado — toda resolucao passa por aqui.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IProvider, ProviderMetadata } from '../../../shared/integration/provider.interface';

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers = new Map<string, IProvider>();

  /** Registra uma implementacao (chamado pelos modulos de provider no boot). */
  register(provider: IProvider): void {
    const key = provider.metadata().key;
    if (this.providers.has(key)) {
      this.logger.warn(`Provider "${key}" já registrado — sobrescrevendo.`);
    }
    this.providers.set(key, provider);
    this.logger.log(`Provider registrado: ${key}`);
  }

  /** Implementação embarcada existe para esta key? */
  has(key: string): boolean {
    return this.providers.has(key);
  }

  /** Resolve a implementacao ou 404 pt-BR. */
  get(key: string): IProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new NotFoundException(`Provider "${key}" sem implementação registrada.`);
    }
    return provider;
  }

  /** Metadata de todas as implementacoes registradas. */
  allMetadata(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => p.metadata());
  }
}
