// Nos de plataforma: TEMPLATE_RENDER (Catalogo de Templates — diretriz 11) e
// EVENT_PUBLISH (publica no Event Bus — diretriz 7).
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../node-registry.service';
import { TemplatesService } from '../../templates/templates.service';
import { EventBusService } from '../../../../shared/events/event-bus.service';

@Injectable()
export class PlatformNodes implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly templates: TemplatesService,
    private readonly eventBus: EventBusService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        type: 'TEMPLATE_RENDER',
        label: 'Montar mensagem de um modelo',
        description: 'Preenche um modelo do catálogo com os dados do fluxo (gera o assunto e o conteúdo prontos para envio).',
        category: 'Plataforma',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'template_id', label: 'Modelo', type: 'template', required: true },
          { key: 'data', label: 'Dados extras (JSON)', type: 'json', help: 'Combinados com os dados do fluxo.' },
        ],
      },
      executor: async (ctx) => {
        const templateId = String(ctx.config['template_id'] ?? '');
        try {
          const data = {
            input: ctx.input,
            vars: ctx.vars,
            ...((ctx.config['data'] ?? {}) as Record<string, unknown>),
          };
          const rendered = await this.templates.render(ctx.organizationId, templateId, data);
          await ctx.log('info', `template renderizado (${rendered.channel}).`);
          return { handle: 'success', output: rendered };
        } catch (e) {
          await ctx.log('error', `render falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) => (config['template_id'] ? [] : ['selecione o template.']),
    });

    this.registry.register({
      definition: {
        type: 'EVENT_PUBLISH',
        label: 'Anunciar acontecimento',
        description: 'Anuncia um acontecimento na plataforma para que outros fluxos possam reagir a ele.',
        category: 'Plataforma',
        kind: 'action',
        outputs: ['success'],
        fields: [
          { key: 'event', label: 'Nome do acontecimento', type: 'text', required: true, placeholder: 'meu.dominio.acao' },
          { key: 'payload', label: 'Dados do acontecimento (JSON)', type: 'json', help: 'Envie apenas os dados essenciais.' },
        ],
      },
      executor: async (ctx) => {
        const event = String(ctx.config['event'] ?? '').trim();
        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] evento "${event}" NÃO publicado (dry-run).`);
          return { handle: 'success', output: { simulated: true } };
        }
        const result = await this.eventBus.publish({
          event,
          organization_id: ctx.organizationId,
          workspace_id: ctx.workspaceId,
          environment_id: ctx.environmentId,
          trace_id: ctx.traceId,
          source_event_id: `${ctx.executionId}:publish:${event}`,
          occurred_at: new Date().toISOString(),
          payload: (ctx.config['payload'] ?? {}) as Record<string, unknown>,
        });
        await ctx.log('info', `evento "${event}" publicado${result.deduped ? ' (deduplicado)' : ''}.`);
        return { handle: 'success', output: result };
      },
      validator: (config) => {
        const event = String(config['event'] ?? '').trim();
        if (!event) return ['informe o nome do evento.'];
        if (!/^[\w.-]+$/.test(event)) return ['nome de evento inválido (use letras, números, ponto e hífen).'];
        return [];
      },
    });
  }
}
