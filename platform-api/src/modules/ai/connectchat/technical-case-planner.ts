import { analyzeTechnicalConversation, normalizeTechnicalConversationText } from './technical-conversation-state';

export type PlannedTechnicalAction =
  | 'ASK_DEVICE_SCOPE'
  | 'REQUEST_SINGLE_DEVICE_CHECK'
  | 'ASK_CONNECTION_STATE'
  | 'ASK_EQUIPMENT_LIGHTS'
  | 'REQUEST_WIFI_PROXIMITY_CHECK'
  | 'ASK_PERFORMANCE_MEDIUM'
  | 'REQUEST_SPEED_TEST'
  | 'ASK_INTERMITTENCE_PATTERN'
  | 'ASK_SYMPTOM_DETAIL'
  | 'ESCALATE_WITH_EVIDENCE';

export interface TechnicalPlan {
  action: PlannedTechnicalAction;
  reasoning: string;
  customerMessage: string;
  symptoms: string[];
  modelSelected: boolean;
}

interface CustomerTechnicalObservation {
  status: 'READY' | 'UNAVAILABLE';
  online: boolean | null;
  hasOpenOs: boolean | null;
  hasOpenTicket: boolean | null;
  incident: boolean;
  sourceStatus: Record<string, 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE'>;
}

const ACTIONS = new Set<PlannedTechnicalAction>([
  'ASK_DEVICE_SCOPE',
  'REQUEST_SINGLE_DEVICE_CHECK',
  'ASK_CONNECTION_STATE',
  'ASK_EQUIPMENT_LIGHTS',
  'REQUEST_WIFI_PROXIMITY_CHECK',
  'ASK_PERFORMANCE_MEDIUM',
  'REQUEST_SPEED_TEST',
  'ASK_INTERMITTENCE_PATTERN',
  'ASK_SYMPTOM_DETAIL',
  'ESCALATE_WITH_EVIDENCE',
]);

export const normalizeTechnicalText = normalizeTechnicalConversationText;

export function hasReportedDeviceScope(messages: string[]): boolean {
  const value = normalizeTechnicalText(messages.join(' '));
  return /\b(todos|todas|nenhum|um aparelho|um dispositivo|so no|apenas no|celular|tv|computador|notebook)\b/.test(value);
}

export function hasReportedIsolatedDevice(messages: string[]): boolean {
  const value = normalizeTechnicalText(messages.join(' '));
  return /\b(so no|apenas no|um aparelho|um dispositivo)\b/.test(value);
}

function safeMessage(action: PlannedTechnicalAction, message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const value = message.replace(/\s+/g, ' ').trim();
  if (!value || value.length > 420 || /\b(CPF|CNPJ)\b/i.test(value)) return null;
  const normalized = normalizeTechnicalText(value);
  const compatible = action === 'ASK_DEVICE_SCOPE'
    ? /aparelh|dispositiv|todos|um deles/.test(normalized)
    : action === 'REQUEST_SINGLE_DEVICE_CHECK'
      ? /aparelh|wifi|wi-fi|rede/.test(normalized)
      : action === 'ASK_CONNECTION_STATE'
        ? /conect|wifi|wi-fi|rede|navega/.test(normalized)
        : action === 'ASK_EQUIPMENT_LIGHTS'
          ? /luz|luzes|los|pon|equipamento|roteador|modem/.test(normalized)
          : action === 'REQUEST_WIFI_PROXIMITY_CHECK'
            ? /perto|proximo|roteador|modem|sinal/.test(normalized)
            : action === 'ASK_PERFORMANCE_MEDIUM'
              ? /cabo|wifi|wi-fi|perto|roteador/.test(normalized)
              : action === 'REQUEST_SPEED_TEST'
                ? /veloc|teste|mbps|mega/.test(normalized)
                : action === 'ASK_INTERMITTENCE_PATTERN'
                  ? /quando|horario|vezes|queda|cai|frequencia/.test(normalized)
      : action === 'ASK_SYMPTOM_DETAIL'
        ? /acontece|erro|luz|mensagem|quando|como/.test(normalized)
        : /equipe|avali|evidenc|limitacao|tecnic/.test(normalized);
  return compatible ? value : null;
}

export function fallbackTechnicalPlan(input: {
  customerMessages: string[];
  assistantMessages?: string[];
}): TechnicalPlan {
  const state = analyzeTechnicalConversation(input.customerMessages, input.assistantMessages ?? []);
  if (state.scope === 'UNKNOWN') {
    return {
      action: 'ASK_DEVICE_SCOPE',
      reasoning: 'Ainda não há evidência sobre o alcance do sintoma nos dispositivos.',
      customerMessage: 'A falha acontece em todos os aparelhos conectados ou somente em um deles?',
      symptoms: [state.symptom.toLowerCase()], modelSelected: false,
    };
  }
  if (state.scope === 'SINGLE') {
    if (!state.localDeviceCheckDone) {
      return {
        action: 'REQUEST_SINGLE_DEVICE_CHECK',
        reasoning: 'A falha está isolada em um aparelho; o primeiro teste seguro deve ficar nesse aparelho.',
        customerMessage: 'Nesse aparelho, desligue e ligue o Wi-Fi e conecte novamente à mesma rede. Depois me diga se voltou.',
        symptoms: ['falha_isolada_em_dispositivo'], modelSelected: false,
      };
    }
    if (!state.errorDetailKnown) {
      return {
        action: 'ASK_SYMPTOM_DETAIL',
        reasoning: 'O teste local já foi feito, mas falta o erro observável do aparelho.',
        customerMessage: 'Depois desse teste, o que aparece nesse aparelho: a rede não conecta, conecta sem internet ou mostra alguma mensagem de erro?',
        symptoms: ['falha_isolada_em_dispositivo'], modelSelected: false,
      };
    }
    return {
      action: 'ESCALATE_WITH_EVIDENCE',
      reasoning: 'O teste seguro no aparelho foi concluído e a falha isolada persiste.',
      customerMessage: 'O teste seguro nesse aparelho foi concluído e a falha persiste. Vou deixar o caso com essas evidências para a equipe continuar sem repetir o diagnóstico.',
      symptoms: ['falha_isolada_em_dispositivo'], modelSelected: false,
    };
  }
  if (state.symptom === 'WIFI_COVERAGE') {
    if (!state.proximityCheckDone) {
      return {
        action: 'REQUEST_WIFI_PROXIMITY_CHECK',
        reasoning: 'É preciso separar cobertura Wi-Fi de indisponibilidade do acesso.',
        customerMessage: 'Faça um teste perto do roteador e me diga se o sinal e a navegação melhoram nesse ponto.',
        symptoms: ['cobertura_wifi'], modelSelected: false,
      };
    }
    return {
      action: 'ESCALATE_WITH_EVIDENCE',
      reasoning: 'O teste de proximidade já foi realizado; não há outro ajuste remoto seguro disponível.',
      customerMessage: 'Registrei o resultado do teste perto do roteador. Vou deixar essas evidências para a equipe avaliar a cobertura sem pedir que você repita o procedimento.',
      symptoms: ['cobertura_wifi'], modelSelected: false,
    };
  }
  if (state.symptom === 'SLOWNESS') {
    if (!state.performanceMediumKnown) {
      return {
        action: 'ASK_PERFORMANCE_MEDIUM',
        reasoning: 'Falta separar desempenho do acesso de limitação do Wi-Fi.',
        customerMessage: 'A lentidão acontece também perto do roteador ou em aparelho conectado por cabo, ou somente no Wi-Fi mais distante?',
        symptoms: ['lentidao'], modelSelected: false,
      };
    }
    if (!state.speedMeasurementKnown) {
      return {
        action: 'REQUEST_SPEED_TEST',
        reasoning: 'Há meio de conexão conhecido, mas ainda falta uma medição observável.',
        customerMessage: 'Sem outros downloads em andamento, faça um teste de velocidade e me informe o resultado em Mbps e se o aparelho estava no cabo ou no Wi-Fi.',
        symptoms: ['lentidao'], modelSelected: false,
      };
    }
    return {
      action: 'ESCALATE_WITH_EVIDENCE',
      reasoning: 'A lentidão já tem escopo, meio e medição; a próxima etapa exige análise técnica da equipe.',
      customerMessage: 'Registrei o meio usado e a medição de velocidade. Vou deixar o caso com essas evidências para a equipe analisar sem reiniciar a investigação.',
      symptoms: ['lentidao'], modelSelected: false,
    };
  }
  if (state.symptom === 'INTERMITTENCE') {
    if (!state.intermittencePatternKnown) {
      return {
        action: 'ASK_INTERMITTENCE_PATTERN',
        reasoning: 'Falta frequência ou padrão temporal para correlacionar as quedas.',
        customerMessage: 'As quedas acontecem em algum horário ou situação específica, e aproximadamente quantas vezes por dia?',
        symptoms: ['intermitencia'], modelSelected: false,
      };
    }
    if (state.equipmentLights === 'UNKNOWN') {
      return {
        action: 'ASK_EQUIPMENT_LIGHTS',
        reasoning: 'O padrão das quedas é conhecido, mas falta a observação física do equipamento durante a falha.',
        customerMessage: 'Quando a conexão cai, alguma luz vermelha ou a luz LOS acende ou pisca no equipamento?',
        symptoms: ['intermitencia'], modelSelected: false,
      };
    }
    return {
      action: 'ESCALATE_WITH_EVIDENCE',
      reasoning: 'A intermitência já possui alcance, padrão e estado observado do equipamento.',
      customerMessage: 'Registrei o padrão das quedas e o estado das luzes do equipamento. Vou deixar essas evidências para a equipe continuar a análise.',
      symptoms: ['intermitencia'], modelSelected: false,
    };
  }
  if (state.symptom === 'NO_CONNECTIVITY') {
    if (state.connectionState === 'UNKNOWN') {
      return {
        action: 'ASK_CONNECTION_STATE',
        reasoning: 'É preciso distinguir falha de associação ao Wi-Fi de sessão sem navegação.',
        customerMessage: 'Os aparelhos entram no Wi-Fi e ficam sem internet, ou nem conseguem conectar à rede?',
        symptoms: ['sem_conectividade'], modelSelected: false,
      };
    }
    if (state.equipmentLights === 'UNKNOWN') {
      return {
        action: 'ASK_EQUIPMENT_LIGHTS',
        reasoning: 'A associação ao Wi-Fi é conhecida, mas falta a observação física antes de alterar o equipamento.',
        customerMessage: 'No equipamento, há alguma luz vermelha ou a luz LOS acesa ou piscando?',
        symptoms: ['sem_conectividade'], modelSelected: false,
      };
    }
    if (state.equipmentLights === 'RED_OR_LOS') {
      return {
        action: 'ESCALATE_WITH_EVIDENCE',
        reasoning: 'O cliente relatou sinal físico de falha no equipamento; reinicialização genérica não é o próximo teste seguro.',
        customerMessage: 'A luz vermelha/LOS é uma evidência importante de falha física. Vou registrar isso para a equipe técnica continuar sem pedir uma reinicialização genérica.',
        symptoms: ['sem_conectividade', 'sinal_fisico_anormal'], modelSelected: false,
      };
    }
  }
  return {
    action: 'ASK_SYMPTOM_DETAIL',
    reasoning: 'As fontes atuais não distinguem a causa e falta uma observação do cliente.',
    customerMessage: 'Quando tenta abrir um site, o que aparece: fica carregando, mostra alguma mensagem de erro ou conecta ao Wi-Fi sem navegar?',
    symptoms: [], modelSelected: false,
  };
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

export function communicateTechnicalPlan(
  plan: TechnicalPlan,
  observation: CustomerTechnicalObservation,
): string {
  if (plan.action === 'ESCALATE_WITH_EVIDENCE' || observation.status !== 'READY') {
    return plan.customerMessage;
  }

  const requiredSources = ['openOs', 'recentTickets', 'incidents', 'contracts', 'accesses'];
  if (!requiredSources.every((source) => observation.sourceStatus[source] === 'AVAILABLE')) {
    return plan.customerMessage;
  }

  const noActiveAttendance = observation.hasOpenOs === false
    && observation.hasOpenTicket === false
    && observation.incident === false;
  const access = observation.online === true
    ? 'Já verifiquei sua conexão: ela aparece online no sistema.'
    : observation.online === false
      ? 'Já verifiquei sua conexão: o acesso aparece offline no sistema.'
      : 'Já verifiquei sua conexão, mas o estado do acesso não veio conclusivo.';
  const attendance = noActiveAttendance
    ? 'No momento, não há ordem de serviço, chamado ou incidente ativo para esse acesso.'
    : '';
  const limitation = observation.online === true
    ? 'Esse status, sozinho, não garante que a internet esteja funcionando.'
    : '';
  const transition = plan.action === 'ASK_DEVICE_SCOPE'
    ? 'Vou investigar isso com você.'
    : plan.action === 'ASK_CONNECTION_STATE'
      ? 'Como a falha atinge os aparelhos conectados, preciso separar uma dificuldade no Wi-Fi de uma conexão sem navegação.'
      : plan.action === 'ASK_EQUIPMENT_LIGHTS'
        ? 'Agora preciso de uma observação do equipamento para diferenciar uma falha física das outras causas.'
        : plan.action === 'REQUEST_SINGLE_DEVICE_CHECK'
          ? 'Como o problema está isolado em um aparelho, vamos começar por um teste seguro nele.'
          : plan.action === 'REQUEST_WIFI_PROXIMITY_CHECK'
            ? 'Esse teste vai ajudar a separar cobertura do Wi-Fi de falha no acesso.'
            : plan.action === 'ASK_PERFORMANCE_MEDIUM'
              ? 'Essa diferença ajuda a separar o desempenho do acesso de uma limitação do Wi-Fi.'
              : plan.action === 'REQUEST_SPEED_TEST'
                ? 'Com o tipo de conexão confirmado, falta uma medição para avançarmos.'
                : plan.action === 'ASK_INTERMITTENCE_PATTERN'
                  ? 'Quero entender o padrão das quedas para não tratar uma ocorrência isolada como recorrente.'
                  : '';
  return [access, attendance, limitation, transition, plan.customerMessage]
    .filter(Boolean).join('\n\n');
}

