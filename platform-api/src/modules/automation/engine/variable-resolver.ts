// Variable Resolver — funcoes PURAS de interpolacao {{namespace.path}} nas
// configs dos nos (mecanica portada do Aquapark). Namespaces da Fase 4:
// input.* (payload do gatilho), vars.<nodeId>.* (saidas de nos anteriores),
// workflow.* e now (ISO).
const TOKEN_RE = /\{\{\s*([\w.[\]-]+)\s*\}\}/g;
const WHOLE_RE = /^\{\{\s*([\w.[\]-]+)\s*\}\}$/;

export interface VariableContext {
  workflow: { id: string; name: string; version: number };
  input: unknown;
  vars: Record<string, unknown>;
  now: string;
  [key: string]: unknown;
}

export function buildVariableContext(args: {
  workflowId: string;
  workflowName: string;
  version: number;
  input: unknown;
  vars: Record<string, unknown>;
}): VariableContext {
  return {
    workflow: { id: args.workflowId, name: args.workflowName, version: args.version },
    input: args.input ?? {},
    vars: args.vars ?? {},
    now: new Date().toISOString(),
  };
}

function resolvePath(path: string, ctx: Record<string, unknown>): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Interpola {{...}} recursivamente em strings/arrays/objetos.
 * String composta SO por um token preserva o tipo do valor resolvido;
 * token nao resolvido vira "".
 */
export function interpolate(value: unknown, ctx: VariableContext): unknown {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE_RE);
    if (whole) {
      const v = resolvePath(whole[1], ctx);
      return v === undefined || v === null ? '' : v;
    }
    return value.replace(TOKEN_RE, (_m, p: string) => {
      const v = resolvePath(p, ctx);
      if (v === null || v === undefined) return '';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = interpolate(v, ctx);
    return out;
  }
  return value;
}

/** Avalia a condicao de uma edge: 'success'/'error'/'true'/'false' casam com o
 *  handle; qualquer outra string e tratada como expressao simples
 *  "{{a}} == valor" (op: ==, !=, >, <, >=, <=, contains, exists). */
export function evaluateEdgeCondition(when: string | undefined, handle: string, ctx: VariableContext): boolean {
  const w = (when ?? '').trim();
  if (!w) return handle !== 'error'; // edge sem condicao segue o caminho feliz
  if (['success', 'error', 'true', 'false'].includes(w)) return w === handle;
  return evaluateExpression(w, ctx);
}

const OPS = ['>=', '<=', '!=', '==', '>', '<'] as const;

/** Expressao simples: "left op right" (com {{tokens}}) ou "left exists". */
export function evaluateExpression(expr: string, ctx: VariableContext): boolean {
  const resolved = String(interpolate(expr, ctx));
  const existsMatch = resolved.match(/^(.*)\s+exists$/i);
  if (existsMatch) return existsMatch[1].trim() !== '';
  const containsMatch = resolved.match(/^(.*)\s+contains\s+(.*)$/i);
  if (containsMatch) return containsMatch[1].trim().includes(containsMatch[2].trim());
  for (const op of OPS) {
    const idx = resolved.indexOf(op);
    if (idx < 0) continue;
    const left = resolved.slice(0, idx).trim();
    const right = resolved.slice(idx + op.length).trim();
    const ln = Number(left);
    const rn = Number(right);
    const numeric = left !== '' && right !== '' && !Number.isNaN(ln) && !Number.isNaN(rn);
    switch (op) {
      case '==': return numeric ? ln === rn : left === right;
      case '!=': return numeric ? ln !== rn : left !== right;
      case '>': return numeric && ln > rn;
      case '<': return numeric && ln < rn;
      case '>=': return numeric && ln >= rn;
      case '<=': return numeric && ln <= rn;
    }
  }
  // Sem operador: truthy textual.
  return resolved !== '' && resolved !== 'false' && resolved !== '0';
}

/** Extrai os caminhos {{...}} de um valor serializado (validacao no publish). */
export function extractTokens(value: unknown): string[] {
  let serialized = '';
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    return [];
  }
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE);
  while ((m = re.exec(serialized)) !== null) out.add(m[1]);
  return Array.from(out);
}

export const KNOWN_NAMESPACES = ['input', 'vars', 'workflow', 'now'];

/** Tokens com namespace desconhecido (aviso no publish). */
export function unknownTokens(value: unknown): string[] {
  return extractTokens(value).filter((t) => !KNOWN_NAMESPACES.includes(t.split('.')[0]));
}
