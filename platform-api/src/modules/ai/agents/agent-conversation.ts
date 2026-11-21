// "Como conversa" de um assistente (porta do Aquapark, genérico). Define como
// ele CONDUZ a conversa em um canal — NÃO entra no system prompt; é lido pelo
// condutor de runtime (inbound → assistente). Espelha agent-persona.ts e
// agent-roteiro.ts: a fonte da verdade é o Json preenchido no editor; aqui só
// interpretamos e normalizamos com valores-padrão seguros.
//
// conversation = {
//   auto_reply:       boolean,   // o assistente responde sozinho neste canal
//   debounce_seconds: number,    // espera antes de responder (junta o bloco de
//                                //   mensagens seguidas); reinicia a cada nova
//                                //   mensagem do contato. Padrão 12, faixa 1..120.
//   split_paragraphs: boolean,   // quebra a resposta em parágrafos curtos
//   supervised:       boolean,   // modo supervisionado: atende sozinho enquanto
//                                //   não há humano responsável, e pede apoio sem
//                                //   transferir (sai só quando alguém assume).
// }

export interface AgentConversation {
  auto_reply: boolean;
  debounce_seconds: number;
  split_paragraphs: boolean;
  supervised: boolean;
}

/** Padrões do Aquapark: 12s de espera, sem resposta automática até o operador
 *  ligar, sem quebra em parágrafos, sem supervisão. */
export const CONVERSATION_DEFAULTS: AgentConversation = {
  auto_reply: false,
  debounce_seconds: 12,
  split_paragraphs: false,
  supervised: false,
};

/** Limites da espera (segundos): igual ao Aquapark — mínimo 1, máximo 120. */
export const DEBOUNCE_MIN = 1;
export const DEBOUNCE_MAX = 120;

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampDebounce(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : CONVERSATION_DEFAULTS.debounce_seconds;
  return Math.min(DEBOUNCE_MAX, Math.max(DEBOUNCE_MIN, n));
}

/** Interpreta um Json arbitrário como AgentConversation (sem any), já com os
 *  padrões aplicados — o chamador sempre recebe um objeto completo e válido. */
export function parseConversation(raw: unknown): AgentConversation {
  if (!raw || typeof raw !== 'object') return { ...CONVERSATION_DEFAULTS };
  const c = raw as Record<string, unknown>;
  return {
    auto_reply: bool(c['auto_reply'], CONVERSATION_DEFAULTS.auto_reply),
    debounce_seconds: clampDebounce(c['debounce_seconds']),
    split_paragraphs: false, // Newnet: uma única bolha por resposta; quebras de linha internas são permitidas.
    supervised: bool(c['supervised'], CONVERSATION_DEFAULTS.supervised),
  };
}
