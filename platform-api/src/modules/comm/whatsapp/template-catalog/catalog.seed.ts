// Catálogo NATIVO de templates HSM do sistema (docs-as-code). São garantidos por
// instalação no boot (upsert por template_name na conexão WhatsApp padrão).
// O usuário só revisa e publica na Meta pela aba "Templates do Sistema".
// Padrão portado do Aquapark (`whatsapp-template-catalog`), adaptado ao
// instância dedicada do IA Studio. Ver CLAUDE.md → "TEMPLATES HSM — REGRA OBRIGATÓRIA".
//
// REGRA DE OURO: todo novo emissor automático fora da janela de 24h nasce COM a
// sua linha aqui (com a `action` do botão quando houver link de acesso).

import { ButtonAction } from './template-actions';

export interface SeedCatalogTemplate {
  /** Gatilho de negócio a que o template atende (chave livre do domínio). */
  event: string;
  template_name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language?: string;
  header_type?: 'TEXT' | null;
  header_content?: string | null;
  /** Corpo com placeholders posicionais {{n}}. */
  body_content: string;
  footer_content?: string | null;
  /** Botões: guardam a AÇÃO simbólica; a URL é resolvida por resolveButtonUrl. */
  buttons_json?: Array<{ type: 'URL' | 'QUICK_REPLY'; text: string; action: ButtonAction }> | null;
  /** Posição→nome-da-variável por componente. */
  variable_map_json: {
    header?: Record<string, string>;
    body?: Record<string, string>;
    footer?: Record<string, string>;
    buttons?: Array<Record<string, string>>;
  };
}

// Renomeações (Meta bloqueia recriar nome recém-excluído): nome antigo → novo.
export const SEED_RENAMES: Record<string, string> = {};

// Templates do sistema aposentados — removidos no boot (idempotente).
export const SEED_REMOVE: string[] = [];

export const SEED_CATALOG: SeedCatalogTemplate[] = [
  // ─── Alerta de incidente à equipe de plantão (frente 6) ──────────────────
  // Enviado à EQUIPE interna (não ao cliente) quando a IA/cron detecta anomalia
  // de rede. {{1}} = resumo do incidente (título · escopo · % offline). Botão
  // estático abre o painel de Incidentes.
  {
    event: 'ISP_INCIDENT_TEAM_ALERT',
    template_name: 'isp_alerta_incidente',
    category: 'UTILITY',
    header_type: null,
    header_content: null,
    body_content:
`🚨 Possível incidente de rede.

{{1}}

Abra o painel para registrar a previsão, ativar o incidente e avisar os clientes.`,
    footer_content: null,
    buttons_json: [{ type: 'URL', text: 'Abrir painel', action: 'OPEN_INCIDENTS' }],
    variable_map_json: {
      body: { '1': 'resumo_incidente' },
      buttons: [{}],
    },
  },
];
