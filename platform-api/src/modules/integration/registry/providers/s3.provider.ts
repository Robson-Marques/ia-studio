// Provider S3-compativel (AWS S3 / Cloudflare R2 / MinIO) — Fase 2:
// health stub OK. O acesso real ao bucket e feito pelo Storage Manager
// (S3Driver com SigV4) — este provider e a porta de configuracao via wizard.
import { Injectable } from '@nestjs/common';
import { ProviderCategory } from '@prisma/client';
import { BaseProvider } from './base.provider';
import {
  HealthResult,
  ProviderContext,
  ProviderMetadata,
} from '../../../../shared/integration/provider.interface';

@Injectable()
export class S3Provider extends BaseProvider {
  metadata(): ProviderMetadata {
    return {
      key: 's3',
      name: 'S3 compatível',
      category: ProviderCategory.STORAGE,
      description: 'Armazenamento de objetos S3-compatível (AWS S3, Cloudflare R2, MinIO).',
      icon: 'hard-drive',
      secretKind: 'API_KEY',
      capabilities: ['health', 'storage:put', 'storage:get', 'storage:delete'],
      wizardSchema: {
        testable: true,
        steps: [
          {
            id: 'bucket',
            title: 'Bucket',
            fields: [
              {
                key: 'endpoint',
                label: 'Endpoint',
                type: 'url',
                required: true,
                placeholder: 'https://s3.amazonaws.com',
                help: 'AWS: https://s3.<região>.amazonaws.com · R2: https://<conta>.r2.cloudflarestorage.com · MinIO: URL do servidor.',
              },
              { key: 'region', label: 'Região', type: 'text', required: true, default: 'us-east-1' },
              { key: 'bucket', label: 'Bucket', type: 'text', required: true },
            ],
          },
          {
            id: 'credentials',
            title: 'Credenciais',
            description: 'Access Key e Secret Key ficam no Cofre de Segredos.',
            fields: [
              { key: 'access_key_id', label: 'Access Key ID', type: 'password', secret: true, required: true },
              { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', secret: true, required: true },
            ],
          },
        ],
      },
    };
  }

  // Stub da Fase 2: valida presenca da configuracao; a validacao real
  // (HEAD bucket assinado) usa o S3Driver do Storage Manager.
  async health(ctx: ProviderContext): Promise<HealthResult> {
    const config = (ctx.connection.config ?? {}) as Record<string, unknown>;
    const endpoint = typeof config['endpoint'] === 'string' ? (config['endpoint'] as string) : '';
    const bucket = typeof config['bucket'] === 'string' ? (config['bucket'] as string) : '';
    if (!endpoint || !bucket) return { ok: false, detail: 'Conexão sem endpoint/bucket configurado.' };
    const accessKey = await ctx.secrets.get('access_key_id');
    if (!accessKey) return { ok: false, detail: 'Credenciais S3 ausentes no Cofre de Segredos.' };
    return {
      ok: true,
      detail: 'Configuração completa (validação assinada do bucket via Storage Manager).',
      checks: { config: true },
    };
  }
}
