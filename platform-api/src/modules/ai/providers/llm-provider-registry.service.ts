// Registry declarativo de providers de LLM (diretriz 35) — espelha o
// ProviderRegistryService do Integration Manager. Map<AiProviderKind,
// ILlmProvider>. Proibido switch por kind espalhado; toda resolucao passa aqui.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiProviderKind } from '@prisma/client';
import { ILlmProvider } from './llm.interface';

@Injectable()
export class LlmProviderRegistryService {
  private readonly logger = new Logger(LlmProviderRegistryService.name);
  private readonly providers = new Map<AiProviderKind, ILlmProvider>();

  register(provider: ILlmProvider): void {
    if (this.providers.has(provider.kind)) {
      this.logger.warn(`Provider LLM "${provider.kind}" já registrado — sobrescrevendo.`);
    }
    this.providers.set(provider.kind, provider);
    this.logger.log(`Provider LLM registrado: ${provider.kind}`);
  }

  has(kind: AiProviderKind): boolean {
    return this.providers.has(kind);
  }

  get(kind: AiProviderKind): ILlmProvider {
    const provider = this.providers.get(kind);
    if (!provider) {
      throw new NotFoundException(`Provider de LLM "${kind}" sem implementação registrada.`);
    }
    return provider;
  }

  all(): ILlmProvider[] {
    return Array.from(this.providers.values());
  }
}
