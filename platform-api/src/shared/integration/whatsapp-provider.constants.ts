import { Connection } from '@prisma/client';

/** Método oficial: a Central Nivoo opera a Meta Cloud API para a instalação. */
export const WHATSAPP_OFFICIAL_PROVIDER_KEY = 'whatsapp-nivoo';
export const WHATSAPP_WAHA_PROVIDER_KEY = 'whatsapp-waha';
export const WHATSAPP_PROVIDER_KEYS = [
  WHATSAPP_OFFICIAL_PROVIDER_KEY,
  WHATSAPP_WAHA_PROVIDER_KEY,
] as const;

export function isWhatsappProvider(providerKey: string): boolean {
  return (WHATSAPP_PROVIDER_KEYS as readonly string[]).includes(providerKey);
}

export function usesOfficialWhatsappWindow(providerKey: string): boolean {
  return providerKey === WHATSAPP_OFFICIAL_PROVIDER_KEY;
}

/** WAHA não entra em disparos automáticos sem opt-in explícito da conexão. */
export function allowsAutomaticWhatsappSend(connection: Connection): boolean {
  if (connection.provider_key === WHATSAPP_OFFICIAL_PROVIDER_KEY) return true;
  if (connection.provider_key !== WHATSAPP_WAHA_PROVIDER_KEY) return false;
  const config = (connection.config ?? {}) as Record<string, unknown>;
  return config['allow_automations'] === true || config['allow_automations'] === 'sim';
}
