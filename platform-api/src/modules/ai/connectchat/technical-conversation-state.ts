export type TechnicalSymptom =
  | 'NO_CONNECTIVITY'
  | 'SLOWNESS'
  | 'INTERMITTENCE'
  | 'WIFI_COVERAGE'
  | 'UNKNOWN';

export type DeviceScope = 'ALL' | 'SINGLE' | 'UNKNOWN';
export type ConnectionState = 'WIFI_WITHOUT_INTERNET' | 'CANNOT_JOIN_WIFI' | 'UNKNOWN';
export type EquipmentLights = 'NORMAL' | 'RED_OR_LOS' | 'UNKNOWN';

export interface TechnicalConversationState {
  symptom: TechnicalSymptom;
  scope: DeviceScope;
  connectionState: ConnectionState;
  equipmentLights: EquipmentLights;
  localDeviceCheckDone: boolean;
  proximityCheckDone: boolean;
  performanceMediumKnown: boolean;
  speedMeasurementKnown: boolean;
  intermittencePatternKnown: boolean;
  errorDetailKnown: boolean;
}

export const normalizeTechnicalConversationText = (value: string): string => value
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim();

function customerText(messages: string[]): string {
  return normalizeTechnicalConversationText(messages.join(' '));
}

function lastCustomerText(messages: string[]): string {
  return normalizeTechnicalConversationText(messages.at(-1) ?? '');
}

function requestedAndAnswered(
  assistantMessages: string[],
  currentCustomerMessage: string,
  requestPattern: RegExp,
): boolean {
  const requested = assistantMessages.slice(-4)
    .some((message) => requestPattern.test(normalizeTechnicalConversationText(message)));
  if (!requested) return false;
  const answer = normalizeTechnicalConversationText(currentCustomerMessage);
  return /\b(fiz|feito|pronto|testei|continua|nao resolveu|nao mudou|igual|funcionou|melhorou|piorou)\b/.test(answer);
}

export function analyzeTechnicalConversation(
  customerMessages: string[],
  assistantMessages: string[] = [],
): TechnicalConversationState {
  const value = customerText(customerMessages);
  const current = lastCustomerText(customerMessages);

  const coverage = /\b(sinal fraco|alcance|nao pega|nao chega|longe do roteador|quarto|comodo|area externa)\b/.test(value);
  const slow = /\b(lenta|lentidao|devagar|velocidade baixa|baixa velocidade|travando)\b/.test(value);
  const intermittent = /\b(cai|caindo|quedas?|oscila|oscilando|instavel|intermitente|vai e volta)\b/.test(value);
  const noConnectivity = /\b(sem internet|sem conexao|sem navegar|nao navega|nao abre|sem acesso|internet caiu)\b/.test(value);
  const symptom: TechnicalSymptom = coverage ? 'WIFI_COVERAGE'
    : slow ? 'SLOWNESS'
      : intermittent ? 'INTERMITTENCE'
        : noConnectivity ? 'NO_CONNECTIVITY' : 'UNKNOWN';

  const allDevices = /\b(todos|todas|varios aparelhos|varios dispositivos|nenhum aparelho|em tudo)\b/.test(value)
    || /\b(celular|telefone)\b.*\b(tv|televisao|computador|notebook)\b/.test(value);
  const singleDevice = /\b(so no|somente no|apenas no|um aparelho|um dispositivo)\b/.test(value);
  const scope: DeviceScope = allDevices ? 'ALL' : singleDevice ? 'SINGLE' : 'UNKNOWN';

  const wifiWithoutInternet = /\bconect(?:a|am|ado|ada|ados|adas)\b.{0,45}\b(wifi|wi-fi|rede)\b.{0,45}\b(sem internet|sem navegar|nao navega)\b/.test(value)
    || /\b(wifi|wi-fi|rede)\b.{0,45}\b(conectad[oa])\b.{0,45}\b(sem internet|sem navegar|nao navega)\b/.test(value);
  const cannotJoin = /\b(nao conecta|nao entra|rede nao aparece|senha incorreta|falha ao conectar)\b.{0,35}\b(wifi|wi-fi|rede)\b/.test(value)
    || /\b(wifi|wi-fi|rede)\b.{0,35}\b(nao conecta|nao entra|nao aparece)\b/.test(value);
  const connectionState: ConnectionState = wifiWithoutInternet ? 'WIFI_WITHOUT_INTERNET'
    : cannotJoin ? 'CANNOT_JOIN_WIFI' : 'UNKNOWN';

  const explicitlyNoRed = /\b(nenhuma|sem|nao tem|nao ha)\b.{0,20}\b(luz vermelha|los acesa|los piscando)\b/.test(value);
  const redOrLos = !explicitlyNoRed && (/\b(los|luz)\b.{0,25}\b(vermelh|acesa|piscando)\b/.test(value)
    || /\bpon\b.{0,25}\b(apagada|piscando)\b/.test(value));
  const normalLights = /\b(luzes?|leds?)\b.{0,25}\b(normais?|verdes?|acesas?)\b/.test(value)
    || explicitlyNoRed;
  const equipmentLights: EquipmentLights = redOrLos ? 'RED_OR_LOS'
    : normalLights ? 'NORMAL' : 'UNKNOWN';

  const localDeviceCheckDone = /\b(desliguei e liguei (o )?wifi|ativei e desativei (o )?wifi|esqueci a rede|reiniciei (o )?(celular|aparelho|computador|tv))\b/.test(value)
    || requestedAndAnswered(assistantMessages, current, /deslig.*lig.*wi-?fi|esquec.*rede|conect.*novamente/);
  const proximityCheckDone = /\b(testei|fiz o teste|continua|melhorou|funciona)\b.{0,35}\b(perto|proximo)\b.{0,20}\b(roteador|modem)\b/.test(value)
    || requestedAndAnswered(assistantMessages, current, /perto|proximo.*roteador/);
  const performanceMediumKnown = /\b(cabo|ethernet|wi-?fi|rede sem fio)\b/.test(value);
  const speedMeasurementKnown = /\b\d{1,5}(?:[.,]\d+)?\s*(?:mbps|mb\/s|mega|megas)\b/.test(value);
  const intermittencePatternKnown = /\b(toda hora|o tempo todo|[1-9]\d* vezes|de manha|a tarde|a noite|madrugada|quando chove|em certos horarios|a cada)\b/.test(value);
  const errorDetailKnown = /\b(fica carregando|tempo esgotado|sem internet|nao abre|rede nao aparece|senha incorreta|erro|conectado sem)\b/.test(value);

  return {
    symptom,
    scope,
    connectionState,
    equipmentLights,
    localDeviceCheckDone,
    proximityCheckDone,
    performanceMediumKnown,
    speedMeasurementKnown,
    intermittencePatternKnown,
    errorDetailKnown,
  };
}
