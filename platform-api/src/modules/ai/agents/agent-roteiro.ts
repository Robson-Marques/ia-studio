// Compila o ROTEIRO de um assistente num fragmento de system prompt. Espelha
// agent-persona.ts: a fonte da verdade e a estrutura (o usuario preenche
// caixinhas em "O que faz"), o texto do prompt e derivado dela.
//
// roteiro = {
//   objetivo: string,
//   passos:    [{ titulo, descricao }],   // executados NA ORDEM
//   situacoes: [{ quando, faca }],        // condicionais (Quando... faca...)
// }
export interface RoteiroPasso {
  titulo?: string;
  descricao?: string;
}
export interface RoteiroSituacao {
  quando?: string;
  faca?: string;
}
export interface AgentRoteiro {
  objetivo?: string;
  passos?: RoteiroPasso[];
  situacoes?: RoteiroSituacao[];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Interpreta um Json arbitrario como AgentRoteiro (sem any). */
export function parseRoteiro(raw: unknown): AgentRoteiro {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const passos = Array.isArray(r['passos'])
    ? (r['passos'] as unknown[])
        .map((p) => (p && typeof p === 'object' ? (p as Record<string, unknown>) : {}))
        .map((p) => ({ titulo: str(p['titulo']), descricao: str(p['descricao']) }))
        .filter((p) => p.titulo || p.descricao)
    : undefined;
  const situacoes = Array.isArray(r['situacoes'])
    ? (r['situacoes'] as unknown[])
        .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {}))
        .map((s) => ({ quando: str(s['quando']), faca: str(s['faca']) }))
        .filter((s) => s.quando || s.faca)
    : undefined;
  return { objetivo: str(r['objetivo']), passos, situacoes };
}

/** Fragmento de system prompt derivado do roteiro (vazio se roteiro vazio). */
export function compileRoteiro(raw: unknown): string {
  const roteiro = parseRoteiro(raw);
  const blocks: string[] = [];

  if (roteiro.objetivo) blocks.push(`## Objetivo\n${roteiro.objetivo}`);

  if (roteiro.passos && roteiro.passos.length > 0) {
    const linhas = roteiro.passos.map((p, i) => {
      const titulo = p.titulo ?? `Passo ${i + 1}`;
      return p.descricao ? `${i + 1}. ${titulo}: ${p.descricao}` : `${i + 1}. ${titulo}`;
    });
    blocks.push(`## Passos (siga nesta ordem)\n${linhas.join('\n')}`);
  }

  if (roteiro.situacoes && roteiro.situacoes.length > 0) {
    const linhas = roteiro.situacoes
      .filter((s) => s.quando || s.faca)
      .map((s) => `- Quando ${s.quando ?? '(situação)'}: ${s.faca ?? ''}`.trimEnd());
    blocks.push(`## Situações\n${linhas.join('\n')}`);
  }

  return blocks.length > 0 ? `\n\n${blocks.join('\n\n')}` : '';
}

/** Há algo aproveitável no roteiro? (para decidir se ignora o `goal` legado.) */
export function hasRoteiro(raw: unknown): boolean {
  const r = parseRoteiro(raw);
  return !!(r.objetivo || (r.passos && r.passos.length) || (r.situacoes && r.situacoes.length));
}
