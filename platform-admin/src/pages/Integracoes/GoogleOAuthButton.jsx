import React, { useEffect, useRef, useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { startGoogleOAuth, getConnection } from '../../services/integrations';
import { toast } from '../../lib/toast';

// Botão "Entrar com Google" (Email Platform — Fase 7). Abre a URL de
// consentimento (retornada pelo start do OAuth) numa janela popup e faz
// polling do status da conexão até virar ACTIVE (ou o popup fechar). Reusado
// no Wizard (passo final) e na tela de Conexões (linha PENDING_AUTH/TOKEN_EXPIRED).
export default function GoogleOAuthButton({ connectionId, onActivated, size = 'md' }) {
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleClick() {
    setLoading(true);
    try {
      const { url } = await startGoogleOAuth(connectionId);
      if (!url) throw new Error('URL de consentimento indisponível.');
      const popup = window.open(url, 'iastudio_google_oauth', 'width=520,height=680');
      popupRef.current = popup;
      if (!popup) {
        toast.error('Não foi possível abrir a janela de login. Libere pop-ups para este site.');
        return;
      }
      startPolling();
      toast.info('Conclua a autorização na janela do Google.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startPolling() {
    setPolling(true);
    let elapsed = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      elapsed += 2500;
      try {
        const conn = await getConnection(connectionId);
        if (conn.status === 'ACTIVE') {
          stopPolling();
          toast.success('Conta Google conectada com sucesso.');
          onActivated?.(conn);
          return;
        }
      } catch {
        // ignora erros transitórios de polling
      }
      // Encerra se o popup fechou sem sucesso ou após ~3 min.
      const popupClosed = popupRef.current && popupRef.current.closed;
      if (popupClosed && elapsed > 3000) { stopPolling(); }
      if (elapsed >= 180000) { stopPolling(); toast.warn('Tempo de autorização esgotado. Tente novamente.'); }
    }, 2500);
  }

  function stopPolling() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPolling(false);
  }

  const busy = loading || polling;
  const cls = size === 'sm' ? 'btn-ghost p-1.5' : 'btn-primary';
  return (
    <button className={`${cls} disabled:opacity-60`} onClick={handleClick} disabled={busy} title="Entrar com Google">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
      {size !== 'sm' && (polling ? 'Aguardando autorização…' : 'Entrar com Google')}
    </button>
  );
}
