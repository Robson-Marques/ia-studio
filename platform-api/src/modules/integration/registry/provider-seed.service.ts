// Seed dos ProviderDefinition no boot (create-if-missing, idempotente).
// Fonte: metadata() das implementacoes registradas + catalogo-only.
// Nunca sobrescreve definição existente — catálogo local preserva adaptações
// (diretriz 43). EXCECAO pontual (REFRESH_KEYS): quando um provider que era
// catalogo-only ganha implementacao real (whatsapp-meta na Fase 3), o wizard
// mudou de forma — a definicao e atualizada UMA vez a partir do metadata().
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RegistryRepository } from './registry.repository';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderMetadata } from '../../../shared/integration/provider.interface';
import { AltaredeProvider } from './providers/altarede.provider';
import { IxcProvider } from './providers/ixc.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { PostgresqlProvider } from './providers/postgresql.provider';
import { SqlServerProvider } from './providers/sqlserver.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { S3Provider } from './providers/s3.provider';
import { WhatsappMetaProvider } from './providers/whatsapp-meta.provider';
import { WhatsappYcloudProvider } from './providers/whatsapp-ycloud.provider';
import { GoogleWorkspaceProvider } from './providers/google-workspace.provider';

// Providers cuja definicao deve ser atualizada no boot (ganhou implementacao).
// smtp: virou envio real (email.send) na Fase 7 — wizard/capabilities mudaram.
// postgresql: ganhou Schema Discovery + SQL read-only na Fase 7 (wizard/caps).
const REFRESH_KEYS = new Set<string>(['whatsapp-meta', 'smtp', 'postgresql']);

@Injectable()
export class ProviderSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderSeedService.name);

  constructor(
    private readonly repository: RegistryRepository,
    private readonly registry: ProviderRegistryService,
    private readonly altarede: AltaredeProvider,
    private readonly ixc: IxcProvider,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly postgresql: PostgresqlProvider,
    private readonly sqlserver: SqlServerProvider,
    private readonly smtp: SmtpProvider,
    private readonly s3: S3Provider,
    private readonly whatsappMeta: WhatsappMetaProvider,
    private readonly whatsappYcloud: WhatsappYcloudProvider,
    private readonly googleWorkspace: GoogleWorkspaceProvider,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 1) Registro em memoria das implementacoes (diretriz 2).
    for (const provider of [this.altarede, this.ixc, this.openai, this.anthropic, this.postgresql, this.sqlserver, this.smtp, this.s3, this.whatsappMeta, this.whatsappYcloud, this.googleWorkspace]) {
      this.registry.register(provider);
    }

    // 2) Seed create-if-missing das definições do catálogo local.
    try {
      const all: ProviderMetadata[] = this.registry.allMetadata();
      for (const meta of all) {
        const existing = await this.repository.findByKey(meta.key);
        if (existing && REFRESH_KEYS.has(meta.key)) {
          // Definicao pre-existente de um provider que ganhou implementacao:
          // atualiza wizard/capabilities (o wizard antigo nao capturava
          // app_secret/verify_token — necessarios pro webhook da Fase 3).
          await this.repository.update(meta.key, {
            name: meta.name,
            description: meta.description,
            icon: meta.icon ?? null,
            wizard_schema: meta.wizardSchema as unknown as Prisma.InputJsonValue,
            capabilities: meta.capabilities as unknown as Prisma.InputJsonValue,
          });
          this.logger.log(`ProviderDefinition atualizado (implementação nova): ${meta.key}`);
          continue;
        }
        if (existing) continue;
        await this.repository.create({
          key: meta.key,
          name: meta.name,
          category: meta.category,
          description: meta.description,
          icon: meta.icon ?? null,
          wizard_schema: meta.wizardSchema as unknown as Prisma.InputJsonValue,
          capabilities: meta.capabilities as unknown as Prisma.InputJsonValue,
          is_active: true,
        });
        this.logger.log(`ProviderDefinition semeado: ${meta.key}`);
      }
    } catch (e) {
      // Seed nunca derruba o boot.
      this.logger.error(`Seed de providers falhou: ${(e as Error).message}`);
    }
  }
}
