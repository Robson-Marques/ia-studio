// Envio "inteligente" respeitando a janela de 24h da Meta (portado do
// Aquapark). Regra unica reutilizavel pelos emissores automaticos (IA e
// automacao nas Fases 4-5):
//   - dentro de 24h            → texto livre (a fala dinamica);
//   - expirou / contato frio   → template HSM aprovado;
//   - texto livre recusado com 131047 → backstop no template (a janela local
//     estava desatualizada; o codigo da Meta e autoritativo).
import { Injectable, Logger } from '@nestjs/common';
import {
  WhatsappOrchestratorService,
  OrchestratorScope,
} from './whatsapp-orchestrator.service';
import { MetaApiError, META_REENGAGEMENT_CODE } from '../../../shared/integration/meta-graph.client';
import { SendCriteria, TemplateVariables } from '../../../shared/integration/whatsapp.types';
import { normalizePhone } from './whatsapp.helpers';

export interface SmartSendArgs extends OrchestratorScope {
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
    const scope: OrchestratorScope = {
      organizationId: args.organizationId,
      workspaceId: args.workspaceId,
      environmentId: args.environmentId,
    };

    const connection = await this.orchestrator.resolveConnection(scope, args.criteria);
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
        { ...scope, phone, criteria: { connectionId: connection.id }, sender: args.sender ?? 'system' },
        { kind: 'text', body: args.text },
      );
      return { via: 'text' };
    } catch (err) {
      // Backstop autoritativo: 131047 → janela local desatualizada → template.
      if (err instanceof MetaApiError && err.metaCode === META_REENGAGEMENT_CODE) {
        this.logger.warn(`Texto livre recusado (131047) para ${phone} — caindo no template ${args.template}.`);
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
          organizationId: args.organizationId,
          workspaceId: args.workspaceId,
          environmentId: args.environmentId,
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
