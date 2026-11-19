import React, { useCallback, useEffect, useState } from 'react';
import { Card, Badge, Button, DescriptionList, CopyButton, useToast } from '@studio-ux-ds/react';
import {
  getCodexLoginStatus, startCodexLogin, cancelCodexLogin, testConnection,
  repairCodex, reconnectCodex,
} from '../../services/integrations';

/**
 * Mesmo padrão de cartões, estado, tipografia e ações das outras conexões.
 * O navegador recebe só o código temporário do login oficial; nunca tokens.
 */
export default function CodexCliLogin({ connectionId, onActivated }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [working, setWorking] = useState(false);
  const [statusError, setStatusError] = useState('');

  const refresh = useCallback(async () => {
    const result = await getCodexLoginStatus(connectionId);
    setStatusError('');
    setState(result);
    return result;
  }, [connectionId]);

  useEffect(() => {
    let active = true;
    getCodexLoginStatus(connectionId)
      .then((data) => { if (active) setState(data); })
      .catch((err) => { if (active) setStatusError(err.message || 'Não foi possível consultar o serviço Codex.'); });
    return () => { active = false; };
  }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state?.login?.stage !== 'waiting') return undefined;
    const interval = setInterval(() => {
      refresh().catch(() => undefined);
    }, 2500);
    return () => clearInterval(interval);
  }, [state?.login?.stage, refresh]);

  async function act(fn) {
    setWorking(true);
    try { await fn(); }
    catch (err) { toast.error(err.message); }
    finally { setWorking(false); }
  }

  const waiting = state?.login?.stage === 'waiting';
  const logged = state?.authenticated === true;
  const stage = statusError ? 'Falha ao consultar' : !state ? 'Verificando' : logged ? 'Conectado' : waiting ? 'Aguardando autorização' : !state?.provisioned ? 'Configuração pendente' : state?.installed === false ? 'Não instalado' : 'Não conectado';
  const tone = logged ? 'success' : waiting ? 'warning' : 'neutral';
  const canRepair = state && (!state.provisioned || !state.installed);

  return (
    <Card>
      <div style={{ padding: 20 }} className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            Conta ChatGPT — Codex CLI
          </h2>
          <Badge tone={tone}>{stage}</Badge>
        </div>
        <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
          Conexão pela conta ChatGPT com autenticação oficial, sem API Key.
          A autorização acontece no site da OpenAI; a sessão fica isolada no servidor.
        </p>
        <DescriptionList items={[
          { key: 'Estado', value: statusError || state?.detail || 'Consultando o Codex CLI…' },
          { key: 'Versão instalada', value: state?.version || '—' },
          { key: 'Autenticação', value: logged ? 'Autenticada' : 'Pendente' },
        ]} />

        {state && (!state.provisioned || state.installed === false) && (
          <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
            {state.detail} Você pode tentar reparar a instalação aqui, sem criar outra conexão.
          </p>
        )}

        {waiting && (
          <div className="space-y-3" aria-live="polite">
            <p style={{ fontSize: 13, margin: 0 }}>
              Abra a página oficial e informe o código de dispositivo abaixo:
            </p>
            <a href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer"
              style={{ color: 'var(--su-link, var(--su-text-primary))', textDecoration: 'underline', fontSize: 13 }}>
              Abrir autorização da OpenAI
            </a>
            <div className="flex items-center gap-3 flex-wrap">
              <code style={{
                fontFamily: 'var(--su-font-mono, monospace)',
                fontSize: 18, fontWeight: 600, letterSpacing: 1,
                color: 'var(--su-text-primary)',
              }}>
                {state.login.deviceCode || 'Aguardando código…'}
              </code>
              {state.login.deviceCode && (
                <CopyButton value={state.login.deviceCode} title="Copiar código de dispositivo" />
              )}
            </div>
            <Button variant="secondary" size="sm" disabled={working}
              onClick={() => act(async () => setState(await cancelCodexLogin(connectionId)))}>
              Cancelar autorização
            </Button>
          </div>
        )}
        {state?.login?.stage === 'error' && (
          <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-secondary)' }}>
            {state.login.detail}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {canRepair && (
            <Button size="sm" disabled={working} onClick={() => act(async () => {
              const result = await repairCodex(connectionId);
              setState(result);
              if (!result?.installed || !result?.provisioned) {
                toast.error(result?.detail || 'O executor Codex ainda não está disponível.');
                return;
              }
              toast.success('Executor Codex confirmado. Continue com o login.');
            })}>
              Reparar instalação
            </Button>
          )}
          {!logged && !waiting && state?.installed === true && state?.provisioned === true && (
            <Button size="sm" disabled={working}
              onClick={() => act(async () => setState(await startCodexLogin(connectionId)))}>
              Entrar com ChatGPT
            </Button>
          )}
          {logged && (
            <Button size="sm" disabled={working} onClick={() => act(async () => {
              const { health } = await testConnection(connectionId);
              await refresh();
              if (!health?.ok) { toast.warn(health?.detail || 'Autenticação não confirmada.'); return; }
              toast.success('Conta ChatGPT conectada.');
              onActivated?.();
            })}>
              Testar e ativar
            </Button>
          )}
          {state?.installed === true && !waiting && (
            <Button size="sm" variant="secondary" disabled={working}
              onClick={() => act(async () => {
                setState(await reconnectCodex(connectionId));
                toast.info('Nova autorização iniciada. Use o código apresentado.');
              })}>
              Reconectar conta
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={working}
            onClick={() => act(refresh)}>
            Atualizar status
          </Button>
        </div>
      </div>
    </Card>
  );
}
