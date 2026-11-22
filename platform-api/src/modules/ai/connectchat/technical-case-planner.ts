export type PlannedTechnicalAction =
  | 'ASK_DEVICE_SCOPE'
  | 'REQUEST_SINGLE_DEVICE_CHECK'
  | 'ASK_SYMPTOM_DETAIL'
  | 'ESCALATE_WITH_EVIDENCE';

export interface TechnicalPlan {
  action: PlannedTechnicalAction;
  reasoning: string;
  customerMessage: string;
  symptoms: string[];
  modelSelected: boolean;
}

const ACTIONS = new Set<PlannedTechnicalAction>([
  'ASK_DEVICE_SCOPE',
  'REQUEST_SINGLE_DEVICE_CHECK',
  'ASK_SYMPTOM_DETAIL',
  'ESCALATE_WITH_EVIDENCE',
]);

export const normalizeTechnicalText = (value: string): string => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

function safeMessage(action: PlannedTechnicalAction, message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const value = message.replace(/\s+/g, ' ').trim();
  if (!value || value.length > 420 || /\b(CPF|CNPJ)\b/i.test(value)) return null;
  const normalized = normalizeTechnicalText(value);
  const compatible = action === 'ASK_DEVICE_SCOPE'
    ? /aparelh|dispositiv|todos|um deles/.test(normalized)
    : action === 'REQUEST_SINGLE_DEVICE_CHECK'
      ? /aparelh|wifi|wi-fi|rede/.test(normalized)
      : action === 'ASK_SYMPTOM_DETAIL'
        ? /acontece|erro|luz|mensagem|quando|como/.test(normalized)
        : /equipe|avali|evidenc|limitacao|tecnic/.test(normalized);
  return compatible ? value : null;
}

export function validateTechnicalPlan(raw: unknown): TechnicalPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value['action'] !== 'string' || !ACTIONS.has(value['action'] as PlannedTechnicalAction)) return null;
  const action = value['action'] as PlannedTechnicalAction;
  const customerMessage = safeMessage(action, value['customerMessage']);
  if (!customerMessage) return null;
  const reasoning = typeof value['reasoning'] === 'string'
    ? value['reasoning'].replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  if (!reasoning) return null;
  const symptoms = Array.isArray(value['symptoms'])
    ? value['symptoms'].filter((item): item is string => typeof item === 'string')
      .map((item) => item.slice(0, 120)).slice(0, 8)
    : [];
  return { action, reasoning, customerMessage, symptoms, modelSelected: true };
}

