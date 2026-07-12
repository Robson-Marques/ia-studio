// Compila a persona de um agente num fragmento de system prompt (porta do
// Aquapark, generico). persona = { tone, emojis, brevity, rules_always[],
// rules_never[] }. Sem dependencia de segmento.
export interface AgentPersona {
  /** Nome com que a IA se apresenta ("Nome que a IA usa" no editor). */
  name?: string;
  tone?: string;
  emojis?: boolean;
  brevity?: 'short' | 'medium' | 'long' | string;
  rules_always?: string[];
  rules_never?: string[];
}

const BREVITY_TEXT: Record<string, string> = {
  short: 'Seja objetivo e conciso; evite rodeios.',
  medium: 'Responda com o nível de detalhe adequado à pergunta.',
  long: 'Explique com detalhes quando ajudar a clareza.',
};

/** Interpreta um Json arbitrario como AgentPersona (sem any). */
export function parsePersona(raw: unknown): AgentPersona {
  if (!raw || typeof raw !== 'object') return {};
  const p = raw as Record<string, unknown>;
  return {
    name: typeof p['name'] === 'string' ? p['name'] : undefined,
    tone: typeof p['tone'] === 'string' ? p['tone'] : undefined,
    emojis: typeof p['emojis'] === 'boolean' ? p['emojis'] : undefined,
    brevity: typeof p['brevity'] === 'string' ? p['brevity'] : undefined,
    rules_always: Array.isArray(p['rules_always'])
      ? (p['rules_always'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
    rules_never: Array.isArray(p['rules_never'])
      ? (p['rules_never'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

/** Fragmento de system prompt derivado da persona (vazio se persona vazia). */
export function compilePersona(raw: unknown): string {
  const persona = parsePersona(raw);
  const lines: string[] = [];
  if (persona.name) lines.push(`Você se chama ${persona.name} — apresente-se por esse nome quando fizer sentido.`);
  if (persona.tone) lines.push(`Tom de voz: ${persona.tone}.`);
  if (persona.emojis === false) lines.push('Não use emojis.');
  if (persona.emojis === true) lines.push('Pode usar emojis com moderação.');
  if (persona.brevity) lines.push(BREVITY_TEXT[persona.brevity] ?? `Extensão preferida: ${persona.brevity}.`);
  if (persona.rules_always && persona.rules_always.length > 0) {
    lines.push('SEMPRE:');
    for (const r of persona.rules_always) lines.push(`- ${r}`);
  }
  if (persona.rules_never && persona.rules_never.length > 0) {
    lines.push('NUNCA:');
    for (const r of persona.rules_never) lines.push(`- ${r}`);
  }
  return lines.length > 0 ? `\n\n## Persona\n${lines.join('\n')}` : '';
}
