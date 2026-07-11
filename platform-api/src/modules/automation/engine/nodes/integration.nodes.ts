// Nos de integracao: HTTP_REQUEST (via connection do Integration Manager OU
// URL direta) e CONNECTION_EXECUTE (porta execute generica do provider).
// Nenhum acesso direto a banco — tudo via ConnectionsService.
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../node-registry.service';
import { ConnectionsService } from '../../../integration/connections/connections.service';
import { httpRequest } from '../../../../shared/integration/http.util';

/** Guarda anti-SSRF simples: bloqueia alvos internos por padrao. */
function assertPublicUrl(raw: string): void {
  if ((process.env['AUTOMATION_HTTP_ALLOW_PRIVATE'] ?? 'off') === 'on') return;
  let host = '';
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error(`URL inválida: ${raw}`);
  }
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === 'metadata.google.internal';
  if (blocked) {
    throw new Error(`Destino "${host}" bloqueado (rede interna). Defina AUTOMATION_HTTP_ALLOW_PRIVATE=on pra liberar em dev.`);
  }
}

@Injectable()
export class IntegrationNodes implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly connections: ConnectionsService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        type: 'HTTP_REQUEST',
        label: 'Chamar sistema externo',
        description: 'Chama uma API externa por endereço direto ou por uma conexão já configurada nas Integrações.',
        category: 'Integrações',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'connection_id', label: 'Conexão (opcional)', type: 'connection', help: 'Se informada, a chamada usa as credenciais guardadas com segurança na conexão.' },
          { key: 'url', label: 'Endereço (URL)', type: 'text', placeholder: 'https://api.exemplo.com/recurso' },
          {
            key: 'method', label: 'Método', type: 'select', default: 'GET',
            options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m })),
          },
          { key: 'headers', label: 'Cabeçalhos (JSON)', type: 'json' },
          { key: 'body', label: 'Corpo (JSON)', type: 'json' },
          { key: 'timeout_ms', label: 'Tempo limite (milissegundos)', type: 'number', default: 15000 },
        ],
      },
      executor: async (ctx) => {
        const connectionId = String(ctx.config['connection_id'] ?? '').trim();
        const url = String(ctx.config['url'] ?? '').trim();
        const method = (String(ctx.config['method'] ?? 'GET').toUpperCase()) as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        const headers = (ctx.config['headers'] ?? {}) as Record<string, string>;
        const body = ctx.config['body'];

        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] HTTP ${method} ${connectionId ? `via conexão ${connectionId}` : url}.`);
          return { handle: 'success', output: { simulated: true, status: 200 } };
        }

        try {
          if (connectionId) {
            const result = await this.connections.execute(ctx.organizationId, connectionId, 'http.request', {
              method, path: url, headers, body,
            });
            await ctx.log('info', `HTTP via conexão ${connectionId} concluído.`);
            return { handle: 'success', output: result };
          }
          if (!url) throw new Error('informe uma URL ou uma conexão.');
          assertPublicUrl(url);
          const res = await httpRequest(url, {
            method, headers,
            body: method === 'GET' ? undefined : body,
            timeoutMs: Number(ctx.config['timeout_ms']) || 15_000,
          });
          await ctx.log(res.ok ? 'info' : 'warn', `HTTP ${method} ${url} → ${res.status}`);
          return { handle: res.ok ? 'success' : 'error', output: { status: res.status, data: res.data } };
        } catch (e) {
          await ctx.log('error', `HTTP falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) =>
        config['url'] || config['connection_id'] ? [] : ['informe uma URL ou uma conexão.'],
    });

    this.registry.register({
      definition: {
        type: 'CONNECTION_EXECUTE',
        label: 'Executar operação de conexão',
        description: 'Executa uma operação específica de um sistema conectado (ex.: consultar dados de cliente no ERP).',
        category: 'Integrações',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'connection_id', label: 'Conexão', type: 'connection', required: true },
          { key: 'operation', label: 'Operação', type: 'text', required: true, placeholder: 'cliente.dados' },
          { key: 'params', label: 'Parâmetros (JSON)', type: 'json' },
        ],
      },
      executor: async (ctx) => {
        const connectionId = String(ctx.config['connection_id'] ?? '').trim();
        const operation = String(ctx.config['operation'] ?? '').trim();
        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] execute "${operation}" na conexão ${connectionId}.`);
          return { handle: 'success', output: { simulated: true } };
        }
        try {
          const result = await this.connections.execute(ctx.organizationId, connectionId, operation, ctx.config['params'] ?? {});
          await ctx.log('info', `operação "${operation}" concluída.`);
          return { handle: 'success', output: result };
        } catch (e) {
          await ctx.log('error', `operação "${operation}" falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) => {
        const errors: string[] = [];
        if (!config['connection_id']) errors.push('selecione a conexão.');
        if (!config['operation']) errors.push('informe a operação.');
        return errors;
      },
    });
  }
}
