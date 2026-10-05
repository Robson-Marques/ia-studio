// Provider Registry (diretriz 2) — registro central + seed das definicoes.
import { Module } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';
import { ProviderSeedService } from './provider-seed.service';
import { RegistryRepository } from './registry.repository';
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

@Module({
  providers: [
    ProviderRegistryService,
    ProviderSeedService,
    RegistryRepository,
    AltaredeProvider,
    IxcProvider,
    OpenAiProvider,
    AnthropicProvider,
    PostgresqlProvider,
    SqlServerProvider,
    SmtpProvider,
    S3Provider,
    WhatsappMetaProvider,
    WhatsappYcloudProvider,
    GoogleWorkspaceProvider,
  ],
  // GoogleWorkspaceProvider exportado: o OAuth controller monta a URL de
  // consentimento (buildConsentUrl) direto no provider.
  exports: [ProviderRegistryService, RegistryRepository, GoogleWorkspaceProvider],
})
export class RegistryModule {}
