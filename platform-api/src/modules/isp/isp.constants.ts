// Constantes da solucao ISP (Fase 6). Nenhuma dependencia de segmento no core:
// tudo que e ISP mora neste modulo, nos providers de ERP e nas tools ISP.

export const ALTAREDE_PROVIDER_KEY = 'altarede';
export const IXC_PROVIDER_KEY = 'ixc';

/**
 * ERPs de provedor suportados. Todos implementam o MESMO contrato canonico de
 * operacoes (`cliente.dados`, `financeiro.*`, `os.cadastrar`,
 * `conectividade.listar_com_status`...), traduzido internamente por cada
 * provider. As tools do agente nunca sabem qual ERP esta do outro lado.
 * Ordem = preferencia em empate (a prioridade da Connection decide antes).
 */
export const ISP_ERP_PROVIDER_KEYS: readonly string[] = [ALTAREDE_PROVIDER_KEY, IXC_PROVIDER_KEY];

// Chaves de filtro de conectividade (nomeadas a partir do Altarede; o IXC
// traduz o que tem equivalente e ignora o resto — ver ixc.helpers.ts).
export const SCOPE_KEYS = [
  'cidade',
  'bairro',
  'ip_concentrador',
  'interface_concentrador',
  'id_olt',
  'id_slot',
  'id_cto',
] as const;

export type ScopeKey = (typeof SCOPE_KEYS)[number];

// Toggles do incidente (default de todos = false — automatismos nascem OFF).
export interface IspIncidentToggles {
  suppress_os?: boolean;
  inform_forecast?: boolean;
  notify_normalization?: boolean;
}

// Rate limit default do disparo proativo (mensagens por segundo). Configuravel
// por chamada; teto de seguranca aplicado no servico.
export const DEFAULT_DISPATCH_RATE_PER_SEC = 5;
export const MAX_DISPATCH_RATE_PER_SEC = 30;
