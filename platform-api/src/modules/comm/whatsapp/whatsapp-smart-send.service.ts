// Envio pela Central respeitando a janela de 24h (portado do
// Aquapark). Regra unica reutilizavel pelos emissores automaticos (IA e
// automacao nas Fases 4-5):
//   - dentro de 24h            → texto livre (a fala dinamica);
//   - expirou / contato frio   → template HSM aprovado;
//   - Central indica requiresTemplate → backstop no template.
import { Injectable, Logger } from '@nestjs/common';
import { WhatsappOrchestratorService } from './whatsapp-orchestrator.service';
import { NivooCentralError } from '../../../shared/integration/nivoo-whatsapp.client';
import { SendCriteria, TemplateVariables } from '../../../shared/integration/whatsapp.types';
import { normalizePhone } from './whatsapp.helpers';

export interface SmartSendArgs {
  phone: string;
  criteria?: SendCriteria;
  /** Texto livre (usado DENTRO da janela de 24h). */
  text: string;
  /** Template de fallback (reengajamento) fora da janela. */
  template: string;
  /** Template pro 1o contato (nunca houve inbound); default = template. */
  coldTemplate?: string;
  language?: string;
  variables?: TemplateVariables;
  /** Emissor que NAO deve interromper conversa recente (dentro de 24h → skip). */
  skipIfWithinWindow?: boolean;
  sender?: string;
}

export type SmartSendVia = 'text' | 'template' | 'skipped';

@Injectable()
export class WhatsappSmartSendService {
  private readonly logger = new Logger(WhatsappSmartSendService.name);

  constructor(private readonly orchestrator: WhatsappOrchestratorService) {}

  async send(args: SmartSendArgs): Promise<{ via: SmartSendVia }> {
    const phone = normalizePhone(args.phone);
    if (!phone) return { via: 'skipped' };
    const language = args.language ?? 'pt_BR';
    const connection = await this.orchestrator.resolveConnection(args.criteria);
    const state = await this.orchestrator.windowState(connection.id, phone);

    // Fora da janela (sabido): direto ao template, sem tentar texto livre.
    if (state !== 'within') {
      const template = state === 'none' ? (args.coldTemplate ?? args.template) : args.template;
      return { via: await this.sendTemplate(args, phone, template, language) };
    }

    // Dentro da janela: emissor "nao-interromper" desiste.
    if (args.skipIfWithinWindow) return { via: 'skipped' };

    // Dentro da janela: texto livre.
    try {
      await this.orchestrator.send(
        { phone, criteria: { connectionId: connection.id }, sender: args.sender ?? 'system' },
        { kind: 'text', body: args.text },
      );
      return { via: 'text' };
    } catch (err) {
      // Backstop da Central: janela local desatualizada → template.
      if (err instanceof NivooCentralError && err.requiresTemplate) {
        this.logger.warn(`Janela encerrada para ${phone} — usando o modelo ${args.template}.`);
        return { via: await this.sendTemplate(args, phone, args.template, language) };
      }
      throw err;
    }
  }

  private async sendTemplate(
    args: SmartSendArgs,
    phone: string,
    templateName: string,
    language: string,
  ): Promise<SmartSendVia> {
    try {
      await this.orchestrator.send(
        {
          phone,
          criteria: args.criteria,
          sender: args.sender ?? 'system',
        },
        { kind: 'template', name: templateName, language, variables: args.variables },
      );
      return 'template';
    } catch (err) {
      // Template nao publicado/aprovado → nao quebra o fluxo do emissor.
      this.logger.warn(`Template "${templateName}" não enviado a ${phone}: ${(err as Error).message}`);
      return 'skipped';
    }
  }
}
