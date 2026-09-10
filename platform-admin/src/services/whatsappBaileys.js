import api, { extractErrorMessage } from '../lib/api';

// ─── WhatsApp · Pareamento Baileys ───────────────────────────
//
// Só o pareamento do socket (QR Code, reconectar, reiniciar). A criação/edição
// da conexão continua no fluxo genérico de Conexões (Integrações › Conexões) —
// este serviço fala com o controller dedicado /comm/whatsapp/baileys, que existe
// porque um socket vivo não cabe no CRUD de registro da conexão.
//
// Vale para os dois tipos Baileys: `whatsapp-baileys-internal` (número interno
// de avisos) e `whatsapp-baileys-manual` (canal de coexistência).

// Estado do pareamento. Retorna { status, qr_image }:
//   status  — 'disconnected' | 'connecting' | 'qr_pending' | 'connected' | 'error'
//   qr_image — data URL PNG (só em 'qr_pending'), ou null.
// A tela consulta em intervalo enquanto o QR está pendente.
export async function getBaileysPairingQr(connectionId) {
  try {
    const { data } = await api.get(`/comm/whatsapp/baileys/connections/${connectionId}/pairing-qr`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao carregar o QR de pareamento')); }
}

// Religa o socket de uma conexão JÁ pareada (sessão salva). Não gera QR novo.
export async function reconnectBaileys(connectionId) {
  try {
    const { data } = await api.post(`/comm/whatsapp/baileys/connections/${connectionId}/reconnect`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reconectar')); }
}

// Descarta a sessão e recomeça o pareamento do zero (novo QR). Use quando o
// número foi desconectado no aparelho ou quando quer trocar de número.
export async function restartBaileysPairing(connectionId) {
  try {
    const { data } = await api.post(`/comm/whatsapp/baileys/connections/${connectionId}/restart-pairing`);
    return data;
  } catch (err) { throw new Error(extractErrorMessage(err, 'Erro ao reiniciar o pareamento')); }
}
