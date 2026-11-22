export type TechnicalSourceState = 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface TechnicalObservation {
  status: 'READY' | 'UNAVAILABLE';
  online: boolean | null;
  hasOpenOs: boolean | null;
  hasOpenTicket: boolean | null;
  incident: boolean;
  blocked: boolean | null;
  multipleAccesses: boolean;
  contractCount: number | null;
  accessCount: number | null;
  sourceStatus: Record<string, TechnicalSourceState>;
}

export type DiagnosticExperimentStatus =
  | 'WAITING_CUSTOMER_OFF'
  | 'WAITING_TELEMETRY_OFF'
  | 'WAITING_CUSTOMER_ON'
  | 'WAITING_TELEMETRY_ON'
  | 'WAITING_CUSTOMER_VALIDATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export interface ActiveDiagnosticExperiment {
  id: string;
  status: DiagnosticExperimentStatus;
  baselineOnline: boolean | null;
  expiresAt: Date;
}

export type TechnicalDecisionKind =
  | 'REQUEST_POWER_OFF'
  | 'OBSERVE_POWER_OFF'
  | 'REQUEST_POWER_ON'
  | 'WAIT_POWER_ON_TELEMETRY'
  | 'WAITING_TELEMETRY'
  | 'REQUEST_NAVIGATION_CHECK'
  | 'CLARIFY_EXPERIMENT_STEP'
  | 'RESOLVE_CASE'
  | 'ESCALATE_CASE'
  | 'EXPERIMENT_TIMED_OUT';

export interface TechnicalDecision {
  kind: TechnicalDecisionKind;
  caseStatus:
    | 'INVESTIGATING'
    | 'WAITING_CUSTOMER'
    | 'WAITING_TELEMETRY'
    | 'TESTING'
    | 'RESOLVED'
    | 'ESCALATED';
  nextAction: string | null;
  facts: Record<string, unknown>;
  fallback: string;
}

interface DecideTechnicalTurnInput {
  currentMessage: string;
  recentCustomerMessages: string[];
  observation: TechnicalObservation;
  activeExperiment: ActiveDiagnosticExperiment | null;
  now?: Date;
}

const normalize = (value: string): string => value.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

function confirmsPowerOff(message: string): boolean {
  const value = normalize(message);
  return /\b(desliguei|desligado|tirei da tomada|retirei da tomada|feito|pronto)\b/.test(value)
    || /^(sim|ja|ok)[.!]?$/.test(value);
}

function confirmsPowerOn(message: string): boolean {
  const value = normalize(message);
  return /\b(religuei|liguei|esta ligado|ta ligado|coloquei na tomada|feito|pronto)\b/.test(value)
    || /^(sim|ja|ok)[.!]?$/.test(value);
}

function reportsRestored(message: string): boolean {
  const value = normalize(message);
  if (/\b(nao voltou|continua sem|ainda sem|nao funciona|nao resolveu|segue sem)\b/.test(value)) return false;
  return /\b(voltou|normalizou|esta funcionando|ta funcionando|funcionou|resolveu|navegando)\b/.test(value);
}

function reportsStillFailing(message: string): boolean {
  return /\b(nao voltou|continua sem|ainda sem|nao funciona|nao resolveu|segue sem|continua igual)\b/
    .test(normalize(message));
}

function reportsAllDevices(messages: string[]): boolean {
  return messages.slice(-8).some((message) => {
    const value = normalize(message);
    return /\b(todos|todas|nenhum aparelho|em tudo|todos os aparelhos|todos os dispositivos)\b/.test(value)
      || /\b(celular|telefone)\b.*\b(tv|televisao|computador|notebook)\b/.test(value);
  });
}

function canStartRestart(observation: TechnicalObservation): boolean {
  const requiredSources = ['openOs', 'recentTickets', 'incidents', 'contracts', 'accesses'];
  return observation.status === 'READY'
    && requiredSources.every((source) => observation.sourceStatus[source] === 'AVAILABLE')
    && observation.online === true
    && observation.hasOpenOs === false
    && observation.hasOpenTicket === false
    && observation.incident === false
    && observation.blocked === false
    && observation.multipleAccesses === false
    && (observation.contractCount === null || observation.contractCount === 1)
    && (observation.accessCount === null || observation.accessCount === 1);
}

export function decideTechnicalTurn(input: DecideTechnicalTurnInput): TechnicalDecision | null {
  const now = input.now ?? new Date();
  const experiment = input.activeExperiment;

  if (experiment && !['COMPLETED', 'CANCELLED', 'TIMED_OUT'].includes(experiment.status)) {
    if (experiment.expiresAt.getTime() <= now.getTime()) {
      return {
        kind: 'EXPERIMENT_TIMED_OUT',
        caseStatus: 'INVESTIGATING',
        nextAction: 'Retomar o diagnóstico e confirmar o estado atual com o cliente.',
        facts: { experimento: 'reinicializacao_assistida', resultado: 'tempo_esgotado' },
        fallback: 'Esse teste ficou sem conclusão. A conexão continua com problema agora? Se continuar, retomo daqui sem pedir que você repita o que já informou.',
      };
    }

    if (experiment.status === 'WAITING_CUSTOMER_OFF') {
      if (!confirmsPowerOff(input.currentMessage)) return {
        kind: 'CLARIFY_EXPERIMENT_STEP',
        caseStatus: 'WAITING_CUSTOMER',
        nextAction: 'Aguardar confirmação de que o equipamento foi desligado.',
        facts: { experimento: 'reinicializacao_assistida', aguardando: 'equipamento_desligado' },
        fallback: 'Para eu comparar a leitura corretamente, preciso saber se o roteador já foi desligado da tomada. Se ainda não desligou, avise quando conseguir; se não puder fazer o teste, também pode me dizer.',
      };
      return {
        kind: 'OBSERVE_POWER_OFF',
        caseStatus: 'TESTING',
        nextAction: 'Comparar o estado da sessão após o equipamento ser desligado.',
        facts: {
          experimento: 'reinicializacao_assistida',
          cliente_confirmou: 'equipamento_desligado',
          estado_inicial_online: experiment.baselineOnline,
          estado_observado_online: input.observation.online,
        },
        fallback: input.observation.online === false
          ? 'Vi que a sessão caiu depois do desligamento. Agora pode ligar o equipamento novamente? Vou acompanhar o retorno.'
          : input.observation.online === true
            ? 'A sessão continua online. Isso pode indicar que o equipamento desligado não é o que mantém a conexão, ou que a leitura ainda não atualizou. Pode ligá-lo novamente? Vou observar o retorno.'
            : 'Não consegui obter uma nova leitura com segurança. Pode ligar o equipamento novamente? Vou continuar o teste sem presumir que a sessão caiu.',
      };
    }

    if (experiment.status === 'WAITING_TELEMETRY_OFF') {
      return {
        kind: 'WAITING_TELEMETRY',
        caseStatus: 'WAITING_TELEMETRY',
        nextAction: 'Aguardar nova leitura do estado da sessão.',
        facts: { experimento: 'reinicializacao_assistida', observacao: 'pendente_apos_desligamento' },
        fallback: 'Ainda estou aguardando a atualização da leitura. Não precisa repetir o procedimento.',
      };
    }

    if (experiment.status === 'WAITING_CUSTOMER_ON') {
      if (!confirmsPowerOn(input.currentMessage)) return {
        kind: 'CLARIFY_EXPERIMENT_STEP',
        caseStatus: 'WAITING_CUSTOMER',
        nextAction: 'Aguardar confirmação de que o equipamento foi ligado novamente.',
        facts: { experimento: 'reinicializacao_assistida', aguardando: 'equipamento_ligado' },
        fallback: 'Agora preciso confirmar se o roteador já foi ligado novamente. Se ainda não ligou, avise quando fizer isso; se não puder continuar o teste, me diga.',
      };
      return {
        kind: 'WAIT_POWER_ON_TELEMETRY',
        caseStatus: 'WAITING_TELEMETRY',
        nextAction: 'Observar automaticamente o restabelecimento da sessão.',
        facts: { experimento: 'reinicializacao_assistida', cliente_confirmou: 'equipamento_ligado' },
        fallback: 'Certo. Vou aguardar a atualização da conexão e verificar se a sessão voltou. Não precisa enviar outra mensagem agora.',
      };
    }

    if (experiment.status === 'WAITING_TELEMETRY_ON') {
      return {
        kind: 'WAITING_TELEMETRY',
        caseStatus: 'WAITING_TELEMETRY',
        nextAction: 'Observar automaticamente o restabelecimento da sessão.',
        facts: { experimento: 'reinicializacao_assistida', observacao: 'pendente_apos_religamento' },
        fallback: 'A leitura ainda está atualizando. Vou continuar acompanhando sem pedir que você repita o teste.',
      };
    }

    if (experiment.status === 'WAITING_CUSTOMER_VALIDATION') {
      if (reportsRestored(input.currentMessage)) {
        return {
          kind: 'RESOLVE_CASE',
          caseStatus: 'RESOLVED',
          nextAction: null,
          facts: { experimento: 'reinicializacao_assistida', cliente_confirmou_navegacao: true },
          fallback: 'Ótimo, a navegação voltou. Vou encerrar este diagnóstico como resolvido. Se a falha reaparecer, o histórico deste teste fica registrado para a equipe.',
        };
      }
      if (reportsStillFailing(input.currentMessage)) {
        return {
          kind: 'ESCALATE_CASE',
          caseStatus: 'ESCALATED',
          nextAction: 'Encaminhar o caso com as evidências do teste e verificar abertura de OS.',
          facts: { experimento: 'reinicializacao_assistida', cliente_confirmou_navegacao: false },
          fallback: 'A sessão retornou, mas a navegação não. Registrei as evidências no caso; a próxima ação indicada é verificar a abertura de uma ordem de serviço.',
        };
      }
      return {
        kind: 'REQUEST_NAVIGATION_CHECK',
        caseStatus: 'WAITING_CUSTOMER',
        nextAction: 'Confirmar se a navegação voltou em mais de um aparelho.',
        facts: { experimento: 'reinicializacao_assistida', sessao_online: input.observation.online },
        fallback: 'A sessão aparece ativa novamente. Teste a navegação em dois aparelhos, se puder, e me diga se voltou ou se continua sem acesso.',
      };
    }
  }

  if (!reportsAllDevices([...input.recentCustomerMessages, input.currentMessage])) return null;
  if (!canStartRestart(input.observation)) return null;

  return {
    kind: 'REQUEST_POWER_OFF',
    caseStatus: 'WAITING_CUSTOMER',
    nextAction: 'Aguardar o cliente desligar o roteador para observar a sessão.',
    facts: {
      sintoma: 'sem_navegacao_em_multiplos_aparelhos',
      sessao_online: true,
      experimento: 'reinicializacao_assistida',
    },
    fallback: 'Como a falha acontece em todos os aparelhos, vamos testar o equipamento compartilhado. Desligue o roteador da tomada e me avise quando estiver desligado.',
  };
}

