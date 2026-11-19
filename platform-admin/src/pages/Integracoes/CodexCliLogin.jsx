import React, { useCallback, useEffect, useState } from 'react';
import { Button, useToast } from '@studio-ux-ds/react';
import {
  getCodexLoginStatus, startCodexLogin, cancelCodexLogin, testConnection,
} from '../../services/integrations';

// Login oficial por dispositivo. Nenhuma credencial, cookie ou token é recebido
// pelo navegador: só o código temporário oferecido pelo Codex CLI.
export default function CodexCliLogin({ connectionId, onActivated }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getCodexLoginStatus(connectionId);
    setState(result);
    return result;
  }, [connectionId]);

  useEffect(() => {
    let active = true;
    getCodexLoginStatus(connectionId).then((data) => {
      if (active) setState(data);
    }).catch((err) => { if (active) toast.error(err.message); });
    return () => { active = false; };
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.login?.stage !== 'waiting') return undefined;
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 2500);
    return () => clearInterval(interval);
  }, [state?.login?.stage, refresh]);

  async function begin() {
    setWorking(true);
    try {
      setState(await startCodexLogin(connectionId));
    } catch (err) {
      toast.error(err.message);
    } finally { setWorking(false); }
  }

  async function cancel() {
    setWorking(true);
    try { setState(await cancelCodexLogin(connectionId)); }
    catch (err) { toast.error(err.message); }
    finally { setWorking(false); }
  }

  async function activate() {
    setWorking(true);
    try {
      const { health } = await testConnection(connectionId);
      await refresh();
      if (health?.ok) {
        toast.success('Conta ChatGPT conectada e pronta para os agentes.');
        onActivated?.();
      } else toast.warn(health?.detail || 'O Codex ainda não confirmou o login.');
    } catch (err) {
      toast.error(err.message);
    } finally { setWorking(false); }
  }

  const waiting = state?.login?.stage === 'waiting';
  return (
    <section className="space-y-3 rounded-lg border p-4" style={{ borderColor: 'var(--su-border-default)' }}>
      <div>
        <h3 className="font-semibold text-sm">Conectar com a conta ChatGPT — Codex CLI</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--su-text-muted)' }}>
          Utiliza sua autenticação oficial do Codex, sem API Key. Sujeito aos limites da conta.
          A autenticação e o histórico do Codex ficam no servidor da instalação.
        </p>
      </div>
      <p className="text-sm">{state?.detail || 'Verificando instalação do Codex CLI…'}</p>
      {state?.version && <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>Instalado: {state.version}</p>}
      {state?.installed === false && (
        <p className="text-xs">Instale o Codex CLI no servidor da API com o comando oficial <code>npm install -g @openai/codex</code>.</p>
      )}
      {waiting && (
        <div className="space-y-2">
          <p className="text-sm">Abra <a href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer" className="underline">auth.openai.com/codex/device</a> e digite o código:</p>
          <p className="text-xl font-mono font-bold tracking-widest" aria-live="polite">{state.login.deviceCode || 'Aguardando código…'}</p>
          <Button size="sm" variant="secondary" disabled={working} onClick={cancel}>Cancelar login</Button>
        </div>
      )}
      {state?.login?.stage === 'error' && <p className="text-xs">{state.login.detail}</p>}
      {state?.login?.stage === 'authenticated' && <p className="text-xs">{state.login.detail}</p>}
      <div className="flex flex-wrap gap-2">
        {!waiting && !state?.authenticated && state?.installed !== false && (
          <Button size="sm" onClick={begin} disabled={working}>Entrar com ChatGPT</Button>
        )}
        {state?.authenticated && (
          <Button size="sm" onClick={activate} disabled={working}>Testar e ativar</Button>
        )}
        <Button size="sm" variant="secondary" disabled={working} onClick={() => refresh().catch(err => toast.error(err.message))}>
          Atualizar status
        </Button>
      </div>
    </section>
  );
}
