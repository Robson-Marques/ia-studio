// Seed da IA no boot (idempotente — nunca derruba o boot):
//   1) registra as implementacoes ILlmProvider no LlmProviderRegistry;
//   2) cria (create-if-missing) os ProviderDefinition categoria AI que ainda
//      nao existem (openai/anthropic ja vem da Fase 2; aqui: gemini, ollama,
//      openrouter, groq, deepseek, mistral) com wizardSchema (api_key + base_url);
//   3) semeia as tools builtin no catalogo (ai_tools) de cada organization.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, ProviderCategory } from '@prisma/client';
import { AiSeedRepository } from './ai-seed.repository';
import { LlmProviderRegistryService } from '../providers/llm-provider-registry.service';
import { OpenAiLlmProvider } from '../providers/impl/openai.provider';
import { AnthropicLlmProvider } from '../providers/impl/anthropic.provider';
import { GeminiLlmProvider } from '../providers/impl/gemini.provider';
import { OllamaLlmProvider } from '../providers/impl/ollama.provider';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { WizardSchema } from '../../../shared/integration/provider.interface';

interface AiProviderSeed {
  key: string;
  name: string;
  description: string;
  /** URL base default (mostrada no wizard; editavel pela connection). */
  defaultBaseUrl?: string;
  /** true = base_url e obrigatorio (ollama/self-hosted). */
  baseUrlRequired?: boolean;
}

// openai e anthropic ja sao semeados na Fase 2 — nao repetimos aqui.
const AI_PROVIDER_SEEDS: AiProviderSeed[] = [
  { key: 'gemini', name: 'Google Gemini', description: 'Modelos Gemini do Google (chat + embeddings).' },
  { key: 'ollama', name: 'Ollama', description: 'Modelos locais/self-hosted via Ollama.', defaultBaseUrl: 'http://localhost:11434', baseUrlRequired: true },
  { key: 'openrouter', name: 'OpenRouter', description: 'Roteador multi-modelo (API compatível com OpenAI).', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  { key: 'groq', name: 'Groq', description: 'Inferência rápida (API compatível com OpenAI).', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  { key: 'deepseek', name: 'DeepSeek', description: 'Modelos DeepSeek (API compatível com OpenAI).', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { key: 'mistral', name: 'Mistral', description: 'Modelos Mistral (API compatível com OpenAI).', defaultBaseUrl: 'https://api.mistral.ai/v1' },
];

@Injectable()
export class AiProvidersSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiProvidersSeedService.name);

  constructor(
    private readonly repository: AiSeedRepository,
    private readonly llmRegistry: LlmProviderRegistryService,
    private readonly openai: OpenAiLlmProvider,
    private readonly anthropic: AnthropicLlmProvider,
    private readonly gemini: GeminiLlmProvider,
    private readonly ollama: OllamaLlmProvider,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 1) Registro em memoria (diretriz 35).
    for (const provider of [this.openai, this.anthropic, this.gemini, this.ollama]) {
      this.llmRegistry.register(provider);
    }

    try {
      // 2) ProviderDefinition categoria AI (create-if-missing).
      for (const seed of AI_PROVIDER_SEEDS) {
        const existing = await this.repository.findProviderDefinition(seed.key);
        if (existing) continue;
        await this.repository.createProviderDefinition({
          key: seed.key,
          name: seed.name,
          category: ProviderCategory.AI,
          description: seed.description,
          icon: 'sparkles',
          wizard_schema: this.buildWizard(seed) as unknown as Prisma.InputJsonValue,
          capabilities: ['chat', 'embed'] as unknown as Prisma.InputJsonValue,
          is_installed_by_default: false,
          is_active: true,
        });
        this.logger.log(`ProviderDefinition AI semeado: ${seed.key}`);
      }

      // 3) Tools builtin no catalogo de cada organization (idempotente).
      const orgs = await this.repository.listOrganizationIds();
      const builtin = this.toolRegistry.all();
      for (const org of orgs) {
        for (const def of builtin) {
          const existing = await this.repository.findTool(org.id, def.key);
          if (existing) continue;
          await this.repository.createTool({
            organization_id: org.id,
            key: def.key,
            name: def.name,
            description: def.description,
            category: def.category,
            input_schema: (def.input_schema ?? {}) as Prisma.InputJsonValue,
            builtin: true,
            builtin_handler: def.key,
            requires_approval: def.requires_approval ?? false,
            timeout_ms: def.timeout_ms ?? 20000,
          });
        }
      }
      this.logger.log(`Tools builtin semeadas em ${orgs.length} organização(ões).`);
    } catch (e) {
      this.logger.error(`Seed de IA falhou: ${(e as Error).message}`);
    }
  }

  private buildWizard(seed: AiProviderSeed): WizardSchema {
    return {
      testable: true,
      steps: [
        {
          id: 'credentials',
          title: 'Credenciais',
          description: 'Informe a API Key (fica cifrada no Cofre de Segredos).',
          fields: [
            {
              key: 'api_key',
              label: 'API Key',
              type: 'password',
              secret: true,
              required: !seed.baseUrlRequired, // Ollama local pode nao exigir key
              placeholder: 'chave do provedor',
            },
            {
              key: 'base_url',
              label: 'URL base',
              type: 'url',
              required: seed.baseUrlRequired ?? false,
              default: seed.defaultBaseUrl,
              help: 'Endpoint da API (compatível com OpenAI quando aplicável).',
            },
          ],
        },
      ],
    };
  }
}
