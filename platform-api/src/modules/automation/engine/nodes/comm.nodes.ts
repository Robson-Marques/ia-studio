// Nos de comunicacao: WHATSAPP_SEND (Meta Orchestrator — o fluxo nunca
// conhece o numero; criterios tag/departamento), EMAIL_SEND (Email Orchestrator
// — Fase 7) e NOTIFY (Notification Center — diretriz 22).
import { Injectable, OnModuleInit } from '@nestjs/common';
import { NodeRegistryService } from '../node-registry.service';
import { WhatsappOrchestratorService } from '../../../comm/whatsapp/whatsapp-orchestrator.service';
import { EmailOrchestratorService } from '../../../comm/email/email-orchestrator.service';
import { NotificationCenterService, NotificationChannel } from '../../notifications/notification-center.service';
import { TemplatesService } from '../../templates/templates.service';
import { RichMessage } from '../../../../shared/integration/whatsapp.types';

@Injectable()
export class CommNodes implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistryService,
    private readonly whatsapp: WhatsappOrchestratorService,
    private readonly email: EmailOrchestratorService,
    private readonly notifications: NotificationCenterService,
    private readonly templates: TemplatesService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      definition: {
        type: 'WHATSAPP_SEND',
        label: 'Enviar WhatsApp',
        description: 'Envia uma mensagem de WhatsApp. O fluxo escolhe a conexão sozinho — você não precisa saber o número.',
        category: 'Comunicação',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'phone', label: 'Telefone do destinatário', type: 'text', required: true, placeholder: '{{input.phone}}' },
          { key: 'text', label: 'Mensagem', type: 'textarea', placeholder: 'Olá {{input.name}}!' },
          { key: 'template_name', label: 'Modelo aprovado (para mensagens fora das 24h)', type: 'text', help: 'Se preenchido, envia o modelo aprovado em vez de texto livre.' },
          { key: 'template_language', label: 'Idioma do modelo', type: 'text', default: 'pt_BR' },
          { key: 'tag', label: 'Departamento (opcional)', type: 'text', help: 'Ajuda a escolher a conexão de envio (opcional).' },
          { key: 'connection_id', label: 'Conexão específica (opcional)', type: 'connection' },
        ],
      },
      executor: async (ctx) => {
        const phone = String(ctx.config['phone'] ?? '').trim();
        const text = String(ctx.config['text'] ?? '').trim();
        const templateName = String(ctx.config['template_name'] ?? '').trim();

        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] WhatsApp para ${phone}: ${templateName ? `template ${templateName}` : text.slice(0, 80)}`);
          return { handle: 'success', output: { simulated: true, state: 'QUEUED' } };
        }
        try {
          const message: RichMessage = templateName
            ? { kind: 'template', name: templateName, language: String(ctx.config['template_language'] || 'pt_BR') }
            : { kind: 'text', body: text };
          const result = await this.whatsapp.send(
            {
              phone,
              criteria: {
                tag: String(ctx.config['tag'] ?? '') || undefined,
                connectionId: String(ctx.config['connection_id'] ?? '') || undefined,
              },
              sender: 'system',
            },
            message,
          );
          await ctx.log('info', `WhatsApp aceito pela Central (job_id=${result.jobId ?? 'n/d'}); confirmação pendente.`);
          return { handle: 'success', output: result };
        } catch (e) {
          await ctx.log('error', `WhatsApp falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) => {
        const errors: string[] = [];
        if (!config['phone']) errors.push('informe o telefone (aceita {{variáveis}}).');
        if (!config['text'] && !config['template_name']) errors.push('informe a mensagem ou um template.');
        return errors;
      },
    });

    this.registry.register({
      definition: {
        type: 'EMAIL_SEND',
        label: 'Enviar e-mail',
        description:
          'Envia um e-mail pela conexão configurada (Gmail ou servidor de e-mail). Pode usar um modelo de e-mail do catálogo.',
        category: 'Comunicação',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'to', label: 'Destinatário', type: 'text', required: true, placeholder: '{{input.email}}' },
          { key: 'subject', label: 'Assunto', type: 'text', help: 'Ignorado se um template com assunto for usado.' },
          { key: 'body', label: 'Corpo (HTML ou texto)', type: 'textarea', placeholder: 'Olá {{input.name}}!' },
          { key: 'template_id', label: 'Template do catálogo (canal E-mail)', type: 'template', help: 'Se preenchido, renderiza o template no lugar de assunto/corpo.' },
          { key: 'cc', label: 'Cópia (CC)', type: 'text' },
          { key: 'bcc', label: 'Cópia oculta (BCC)', type: 'text' },
          { key: 'tag', label: 'Tag da conexão de e-mail', type: 'text', help: 'Critério de roteamento do orquestrador (opcional).' },
          { key: 'connection_id', label: 'Conexão específica (opcional)', type: 'connection' },
        ],
      },
      executor: async (ctx) => {
        const to = String(ctx.config['to'] ?? '').trim();
        let subject = String(ctx.config['subject'] ?? '').trim();
        let html = String(ctx.config['body'] ?? '').trim();
        let text: string | undefined;

        // Template EMAIL do catalogo (diretriz 11) — renderiza subject/body.
        const templateId = String(ctx.config['template_id'] ?? '').trim();
        if (templateId) {
          try {
            const rendered = await this.templates.render(templateId, {
              input: ctx.input,
              vars: ctx.vars,
            });
            if (rendered.subject) subject = rendered.subject;
            html = rendered.body;
          } catch (e) {
            await ctx.log('warn', `template ${templateId} indisponível (${(e as Error).message}) — usando assunto/corpo diretos.`);
          }
        }
        // Corpo sem tags = trata como texto puro (fallback amigável).
        if (html && !/</.test(html)) {
          text = html;
          html = '';
        }

        if (ctx.dryRun) {
          await ctx.log('info', `[simulado] e-mail para ${to}: ${subject || '(sem assunto)'}`);
          return { handle: 'success', output: { simulated: true, to } };
        }
        try {
          const result = await this.email.send(
            {
              to,
              subject,
              html: html || undefined,
              text,
              cc: String(ctx.config['cc'] ?? '').trim() || undefined,
              bcc: String(ctx.config['bcc'] ?? '').trim() || undefined,
            },
            {
              connectionId: String(ctx.config['connection_id'] ?? '') || undefined,
              tag: String(ctx.config['tag'] ?? '') || undefined,
            },
          );
          await ctx.log('info', `e-mail enviado (message_id=${result.message_id ?? 'n/d'}, via ${result.provider_key}).`);
          return { handle: 'success', output: result };
        } catch (e) {
          await ctx.log('error', `e-mail falhou: ${(e as Error).message}`);
          return { handle: 'error', output: { error: (e as Error).message } };
        }
      },
      validator: (config) => {
        const errors: string[] = [];
        if (!config['to']) errors.push('informe o destinatário.');
        if (!config['subject'] && !config['template_id']) errors.push('informe o assunto ou um template.');
        if (!config['body'] && !config['template_id']) errors.push('informe o corpo ou um template.');
        return errors;
      },
    });

    this.registry.register({
      definition: {
        type: 'NOTIFY',
        label: 'Enviar aviso',
        description: 'Envia um aviso pelo melhor canal disponível (tenta WhatsApp, depois e-mail, depois o sino do painel).',
        category: 'Comunicação',
        kind: 'action',
        outputs: ['success', 'error'],
        fields: [
          { key: 'phone', label: 'Telefone (WhatsApp)', type: 'text', placeholder: '{{input.phone}}' },
          { key: 'email', label: 'E-mail', type: 'text', placeholder: '{{input.email}}' },
          { key: 'user_id', label: 'Usuário do painel (sino)', type: 'text', help: 'Vazio + sem telefone/e-mail = aviso geral no sino da organização.' },
          { key: 'template_id', label: 'Template do catálogo', type: 'template' },
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'body', label: 'Conteúdo', type: 'textarea' },
          {
            key: 'channel', label: 'Canal', type: 'select', default: '',
            options: [
              { value: '', label: 'Automático (com fallback)' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'email', label: 'E-mail' },
              { value: 'in_app', label: 'Sino do painel' },
            ],
          },
        ],
      },
      executor: async (ctx) => {
        const channel = String(ctx.config['channel'] ?? '').trim();
        const recipient = {
          phone: String(ctx.config['phone'] ?? '').trim() || undefined,
          email: String(ctx.config['email'] ?? '').trim() || undefined,
          user_id: String(ctx.config['user_id'] ?? '').trim() || (ctx.config['phone'] || ctx.config['email'] ? undefined : ''),
        };
        if (ctx.dryRun) {
          await ctx.log('info', '[simulado] notificação NÃO enviada (dry-run).');
          return { handle: 'success', output: { simulated: true } };
        }
        const result = await this.notifications.notify({
          recipient,
          templateId: String(ctx.config['template_id'] ?? '') || undefined,
          title: String(ctx.config['title'] ?? '') || undefined,
          body: String(ctx.config['body'] ?? '') || undefined,
          data: { input: ctx.input, vars: ctx.vars },
          channel: (channel || undefined) as NotificationChannel | undefined,
          traceId: ctx.traceId,
        });
        await ctx.log('info', `notificação encaminhada (canal=${result.channel ?? 'auto'}, status=${result.status}).`);
        return { handle: result.status === 'FAILED' ? 'error' : 'success', output: result };
      },
      validator: (config) => {
        if (!config['template_id'] && !config['title'] && !config['body']) {
          return ['informe um template ou título/conteúdo.'];
        }
        return [];
      },
    });
  }
}
