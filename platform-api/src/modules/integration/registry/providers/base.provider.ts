// Base dos providers concretos — defaults sensatos pra Fase 2:
//   connect = health; disconnect = no-op; execute/discover = nao suportado.
// Cada provider sobrescreve o que realmente implementa.
import { BadRequestException } from '@nestjs/common';
import {
  ConnectResult,
  DiscoveryResult,
  HealthResult,
  IProvider,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';

export abstract class BaseProvider implements IProvider {
  abstract metadata(): ProviderMetadata;

  abstract health(ctx: ProviderContext): Promise<HealthResult>;

  async connect(ctx: ProviderContext, _config: Record<string, unknown>): Promise<ConnectResult> {
    const result = await this.health(ctx);
    return { ok: result.ok, detail: result.detail };
  }

  async disconnect(_ctx: ProviderContext): Promise<void> {
    // Sem sessao remota a encerrar nesta fase.
  }

  async execute(_ctx: ProviderContext, operation: string, _params: unknown): Promise<unknown> {
    throw new BadRequestException(
      `Operação "${operation}" não suportada pelo provider "${this.metadata().key}" nesta fase.`,
    );
  }

  async discover(_ctx: ProviderContext): Promise<DiscoveryResult> {
    return { resources: [] };
  }
}
