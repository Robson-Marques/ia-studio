const GREETING_ONLY = /^(oi+|ol[aá]|bom dia|boa tarde|boa noite|opa|hello)[!., ]*$/i;

export function greetingForNewnet(at: Date = new Date()): string {
  const hourText = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(at);
  const hour = Number.parseInt(hourText, 10) % 24;
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function habitualCustomerQuestion(
  customerName: string,
  incoming: string,
  at: Date = new Date(),
): string {
  if (GREETING_ONLY.test(incoming.trim())) {
    return `${greetingForNewnet(at)}! Eu sou a Nete, da Newnet.\n\n`
      + `O atendimento é sobre a conexão de ${customerName}?`;
  }
  return `Entendi. Vou cuidar disso com você.\n\n`
    + `Antes de continuar, preciso confirmar: o atendimento é sobre a conexão de ${customerName}?`;
}

export function habitualCustomerConfirmed(customerName: string | null): string {
  const firstName = customerName?.trim().split(/\s+/)[0];
  return firstName
    ? `Perfeito, ${firstName}. Obrigada por confirmar.\n\nComo posso ajudar você hoje?`
    : 'Perfeito, obrigada por confirmar.\n\nComo posso ajudar você hoje?';
}
