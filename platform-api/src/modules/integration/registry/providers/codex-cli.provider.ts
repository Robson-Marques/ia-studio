import { Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import { ProviderContext, ProviderMetadata, HealthResult } from '../../../../shared/integration/provider.interface';
import { CodexCliService } from './codex-cli.service';

/** Conexão ChatGPT via login oficial do Codex CLI, sem chave de API. */
@Injectable()
export class CodexCliIntegrationProvider extends BaseProvider {
  constructor(private readonly cli: CodexCliService) { super(); }

  metadata(): ProviderMetadata {
    return {
      key: 'codex-cli',
      name: 'ChatGPT — Codex CLI (conta)',
      category: ProviderCategory.AI,
      description: 'Usa a conta ChatGPT autenticada pelo Codex CLI no servidor, separada da API OpenAI.',
      icon: 'sparkles',
      capabilities: ['health', 'chat', 'login:device-code'],
      wizardSchema: {
        testable: false,
        steps: [{
          id: 'login',
          title: 'Autenticação ChatGPT',
          description: 'Salve a conexão e abra seu detalhe para entrar com a conta ChatGPT usando código de dispositivo. Não exige API Key.',
          fields: [],
        }],
      },
    };
  }

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const s = await this.cli.status(ctx.connection.id);
    return {
      ok: s.installed && s.authenticated,
      pendingAuth: s.installed && !s.authenticated,
      detail: s.detail,
      checks: { installed: s.installed, authenticated: s.authenticated },
    };
  }
}
