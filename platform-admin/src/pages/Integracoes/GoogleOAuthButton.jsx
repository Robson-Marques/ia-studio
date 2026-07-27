import React, { useEffect, useRef, useState } from 'react';
import { Button, useToast } from '@studio-ux-ds/react';
import { startGoogleOAuth, getConnection } from '../../services/integrations';

// "Entrar com Google" — abre a tela de consentimento numa janela à parte e fica
// perguntando pela conexão até ela virar ACTIVE (ou o usuário desistir). Usado na
// criação da conexão e na lista, quando a conta precisa ser (re)autorizada.
// Migrado pro DS na v0.10.11: o rótulo já dizia o que estava acontecendo
// ("Aguardando autorização…"), então o `loading` do Button do DS entra sem perda.
export default function GoogleOAuthButton({ connectionId, onActivated, size = 'md' }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleClick() {
    setLoading(true);
    try {
      const { url } = await startGoogleOAuth(connectionId);
      if (!url) throw new Error('O endereço de autorização não veio — tente de novo em instantes.');
      const popup = window.open(url, 'iastudio_google_oauth', 'width=520,height=680');
      popupRef.current = popup;
      if (!popup) {
        toast.error('O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.');
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
          toast.success('Conta Google conectada.');
          onActivated?.(conn);
          return;
        }
      } catch {
        // Erro passageiro de rede não encerra a espera — a janela do Google
        // continua aberta e o usuário ainda pode concluir.
      }
      const popupClosed = popupRef.current && popupRef.current.closed;
      if (popupClosed && elapsed > 3000) stopPolling();
      if (elapsed >= 180000) { stopPolling(); toast.warn('A autorização demorou demais. Tente novamente.'); }
    }, 2500);
  }

  function stopPolling() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPolling(false);
  }

  return (
    <Button
      variant={size === 'sm' ? 'ghost' : 'primary'}
      size={size === 'sm' ? 'sm' : 'md'}
      icon="login"
      loading={loading || polling}
      title="Abre a tela de consentimento do Google numa janela à parte"
      onClick={handleClick}
    >
      {polling ? 'Aguardando autorização…' : 'Entrar com Google'}
    </Button>
  );
}
