// Deteccao basica de prompt injection (porta do Aquapark). Heuristica de
// padroes conhecidos + redacao de palavras bloqueadas (guardrails). Nao e
// barreira absoluta — reduz risco e loga alertas.
import { Injectable, Logger } from '@nestjs/common';

// Padroes classicos de tentativa de override de instrucoes.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|previous|the above) (instructions|prompts)/i,
  /disregard (all|previous|your) (instructions|rules)/i,
  /you are now (a|an) /i,
  /reveal (your|the) (system )?prompt/i,
  /esque(ç|c)a (as|todas as) instru(ç|c)(õ|o)es/i,
  /ignore (as|todas as) (instru(ç|c)(õ|o)es|regras)/i,
  /developer mode/i,
  /jailbreak/i,
];

export interface PromptCheckResult {
  suspicious: boolean;
  matches: string[];
}

@Injectable()
export class PromptSecurityService {
  private readonly logger = new Logger(PromptSecurityService.name);

  /** Detecta padroes de injecao no texto do usuario. */
  inspect(input: string): PromptCheckResult {
    const matches: string[] = [];
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(input)) matches.push(pattern.source);
    }
    if (matches.length > 0) {
      this.logger.warn(`Possível prompt injection detectado (${matches.length} padrão(ões)).`);
    }
    return { suspicious: matches.length > 0, matches };
  }

  /** Redige palavras bloqueadas do guardrail no texto de saida. */
  redactBlockedWords(text: string, blocked: string[]): string {
    if (!blocked || blocked.length === 0) return text;
    let out = text;
    for (const word of blocked) {
      if (!word.trim()) continue;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'gi'), '***');
    }
    return out;
  }
}
