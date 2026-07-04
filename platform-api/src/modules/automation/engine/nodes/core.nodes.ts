// Nos de nucleo: gatilhos (TRIGGER_*) + logica de fluxo (CONDITION, DELAY).
// Gatilhos sao pontos de entrada — executores no-op que apenas expõem o
// input; o disparo real acontece fora da engine (bus/scheduler/webhook/UI).
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../node-registry.service';
import { evaluateExpression } from '../variable-resolver';

/** Delay acima disso e re-agendado via broker (a engine trata pauseMs). */
const INLINE_DELAY_MAX_MS = 30_000;

@Injectable()
export class CoreNodes implements OnModuleInit {
  constructor(private readonly registry: NodeRegistryService) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        type: 'TRIGGER_MANUAL',
        label: 'Gatilho manual',
        description: 'Inicia o fluxo manualmente (botão Executar).',
        category: 'Gatilhos',
        kind: 'trigger',
        outputs: ['success'],
        fields: [],
      },
      executor: async (ctx) => {
        await ctx.log('info', 'gatilho manual acionado.');
        return { handle: 'success', output: ctx.input };
      },
    });

    this.registry.register({
      definition: {
        type: 'TRIGGER_EVENT',
        label: 'Gatilho por evento',
        description: 'Dispara quando um evento é publicado no Event Bus (ex.: whatsapp.inbound.message).',
        category: 'Gatilhos',
        kind: 'trigger',
        outputs: ['success'],
        fields: [
          {
            key: 'event',
            label: 'Evento',
            type: 'text',
            required: true,
            placeholder: 'whatsapp.inbound.message',
            help: 'Nome do evento assinado no bus. Também configure o gatilho do fluxo como "Evento".',
          },
        ],
      },
      executor: async (ctx) => {
        await ctx.log('info', 'gatilho por evento acionado.', { event: ctx.config['event'] });
        return { handle: 'success', output: ctx.input };
      },
      validator: (config) => (config['event'] ? [] : ['informe o nome do evento.']),
    });

    this.registry.register({
      definition: {
        type: 'TRIGGER_SCHEDULE',
        label: 'Gatilho agendado',
        description: 'Dispara conforme o agendamento configurado no fluxo (Scheduler).',
        category: 'Gatilhos',
        kind: 'trigger',
        outputs: ['success'],
        fields: [],
      },
      executor: async (ctx) => {
        await ctx.log('info', 'gatilho agendado acionado.');
        return { handle: 'success', output: ctx.input };
      },
    });

    this.registry.register({
      definition: {
        type: 'TRIGGER_WEBHOOK',
        label: 'Gatilho por webhook',
        description: 'Dispara via POST /api/webhooks/flows/:token (token gerado ao publicar).',
        category: 'Gatilhos',
        kind: 'trigger',
        outputs: ['success'],
        fields: [],
      },
      executor: async (ctx) => {
        await ctx.log('info', 'gatilho por webhook acionado.');
        return { handle: 'success', output: ctx.input };
      },
    });

    this.registry.register({
      definition: {
        type: 'CONDITION',
        label: 'Condição',
        description: 'Ramifica o fluxo entre "true" e "false" conforme uma comparação.',
        category: 'Lógica',
        kind: 'action',
        outputs: ['true', 'false'],
        fields: [
          { key: 'left', label: 'Valor da esquerda', type: 'text', required: true, placeholder: '{{input.status}}' },
          {
            key: 'op',
            label: 'Operador',
            type: 'select',
            required: true,
            default: '==',
            options: [
              { value: '==', label: 'igual (==)' },
              { value: '!=', label: 'diferente (!=)' },
              { value: '>', label: 'maior (>)' },
              { value: '<', label: 'menor (<)' },
              { value: '>=', label: 'maior ou igual (>=)' },
              { value: '<=', label: 'menor ou igual (<=)' },
              { value: 'contains', label: 'contém' },
              { value: 'exists', label: 'existe' },
            ],
          },
          { key: 'right', label: 'Valor da direita', type: 'text', placeholder: 'pago' },
        ],
      },
      executor: async (ctx) => {
        const left = String(ctx.config['left'] ?? '');
        const op = String(ctx.config['op'] ?? '==');
        const right = String(ctx.config['right'] ?? '');
        const expr = op === 'exists' ? `${left} exists` : `${left} ${op} ${right}`;
        // Config ja chegou interpolada — avalia como expressao literal.
        const result = evaluateExpression(expr, {
          workflow: { id: '', name: '', version: 0 },
          input: ctx.input,
          vars: ctx.vars,
          env: {
            organization_id: ctx.organizationId,
            workspace_id: ctx.workspaceId,
            environment_id: ctx.environmentId,
          },
          now: new Date().toISOString(),
        });
        await ctx.log('info', `condição "${expr}" → ${result}`);
        return { handle: result ? 'true' : 'false', output: result };
      },
      validator: (config) => {
        const errors: string[] = [];
        if (!config['left']) errors.push('informe o valor da esquerda.');
        if (!config['op']) errors.push('informe o operador.');
        return errors;
      },
    });

    this.registry.register({
      definition: {
        type: 'DELAY',
        label: 'Atraso',
        description: 'Aguarda um intervalo antes do próximo passo (longo = re-agendado via fila, sem travar o worker).',
        category: 'Lógica',
        kind: 'action',
        outputs: ['success'],
        fields: [
          { key: 'seconds', label: 'Segundos de espera', type: 'number', required: true, default: 10 },
        ],
      },
      executor: async (ctx) => {
        const seconds = Math.max(0, Number(ctx.config['seconds']) || 0);
        const ms = seconds * 1000;
        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] aguardaria ${seconds}s.`);
          return { handle: 'success' };
        }
        if (ms > INLINE_DELAY_MAX_MS) {
          await ctx.log('info', `atraso de ${seconds}s — continuação re-agendada via broker.`);
          return { handle: 'success', pauseMs: ms };
        }
        await ctx.log('info', `aguardando ${seconds}s.`);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        return { handle: 'success' };
      },
      validator: (config) => {
        const s = Number(config['seconds']);
        if (Number.isNaN(s) || s < 0) return ['segundos de espera inválidos.'];
        if (s > 60 * 60 * 24 * 30) return ['atraso máximo: 30 dias.'];
        return [];
      },
    });
  }
}
