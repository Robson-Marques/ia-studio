import React, { useEffect, useMemo, useState } from 'react';
import { ListScreen, Badge, Button, Modal, Field, Input, Select, Checkbox, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import {
  listNumbers, syncNumber,
  getNumberAssistant, setNumberAssistant, removeNumberAssistant,
  getCentralSetup, configureCentralSetup, startCentralOnboarding, getCentralOnboardingSession, disconnectCentralNumber,
} from '../../services/whatsapp';
import { listAgents } from '../../services/ai';
import { formatPhone } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// WhatsApp/Números — onboarding, situação, histórico, assistente e desconexão
// dos números pertencentes à instalação Newnet na Central Nivoo.

const STATUS_LABEL = {
  ACTIVE: { label: 'Ativa', variant: 'green' },
  DISABLED: { label: 'Desativada', variant: 'gray' },
  MAINTENANCE: { label: 'Manutenção', variant: 'yellow' },
  TOKEN_EXPIRED: { label: 'Token expirado', variant: 'red' },
  ERROR: { label: 'Erro', variant: 'red' },
  RECONNECTING: { label: 'Reconectando', variant: 'yellow' },
  SYNCING: { label: 'Sincronizando', variant: 'blue' },
  PENDING_AUTH: { label: 'Aguardando autenticação', variant: 'yellow' },
};

export default function Numeros() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState('');
  // Vínculo assistente↔número (map connection_id → view).
  const [bindings, setBindings] = useState({});
  const [agents, setAgents] = useState([]);
  const [modalNumber, setModalNumber] = useState(null); // número sendo editado
  const [mAgentId, setMAgentId] = useState('');
  const [mEnabled, setMEnabled] = useState(true);
  const [savingBind, setSavingBind] = useState(false);
  const [setup, setSetup] = useState({ configured: false });
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupInstallationId, setSetupInstallationId] = useState('');
  const [setupOrigin, setSetupOrigin] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const canManageAssistant = can('comm.whatsapp.assistant.manage');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((n) =>
      (n.name || '').toLowerCase().includes(term) ||
      (n.phone || '').toLowerCase().includes(term) ||
      (n.display_name || '').toLowerCase().includes(term));
  }, [items, q]);

  async function load() {
    setLoading(true);
    try {
      const [setup, numbers] = await Promise.all([getCentralSetup(), listNumbers()]);
      setSetup(setup);
      setItems(numbers);
      loadBindings(numbers);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Vínculo de cada número (para a coluna "Assistente"). Uma falha de leitura
  // é informada sem esconder os demais números da lista.
  async function loadBindings(numbers) {
    const results = await Promise.all(
      (numbers || []).map((n) =>
        getNumberAssistant(n.id).then((v) => [n.id, v, null]).catch((error) => [n.id, null, error]),
      ),
    );
    const map = {};
    for (const [id, view] of results) if (view) map[id] = view;
    const failure = results.find(([, , error]) => error)?.[2];
    if (failure) toast.error(`Não foi possível carregar alguns vínculos de assistentes: ${failure.message}`);
    setBindings(map);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId) return undefined;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const session = await getCentralOnboardingSession(sessionId);
        if (session.status === 'CONNECTED') {
          window.clearInterval(timer);
          setSessionId(null);
          toast.success('Número conectado pela Central WhatsApp.');
          await load();
        } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
          window.clearInterval(timer);
          setSessionId(null);
          toast.error(session.failure_message || 'A conexão não foi concluída. Inicie uma nova tentativa.');
        }
      } catch (err) {
        window.clearInterval(timer);
        setSessionId(null);
        toast.error(err.message);
      } finally { polling = false; }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connectNumber() {
    if (!setup.configured) {
      openSetup();
      return;
    }
    // A jornada hospedada pela Nivoo é curta e autocontida. Abrimos como
    // janela auxiliar, igual ao fluxo operacional do AquaPark, para o
    // administrador continuar vendo o IA Studio ao fundo em vez de perder o
    // contexto em outra aba.
    const popup = window.open(
      'about:blank',
      'nivoo-whatsapp-connect',
      'popup,width=560,height=720,resizable=yes,scrollbars=yes',
    );
    if (!popup) { toast.error('Permita abrir a janela de conexão do WhatsApp.'); return; }
    popup.opener = null;
    popup.focus();
    setConnecting(true);
    try {
      const session = await startCentralOnboarding();
      if (new URL(session.launch_url).origin !== 'https://integracoes.nivoo.dev.br') {
        throw new Error('A Central retornou um endereço de conexão inesperado.');
      }
      popup.location.href = session.launch_url;
      setSessionId(session.session_id);
    } catch (err) {
      popup.close();
      toast.error(err.message);
    } finally { setConnecting(false); }
  }

  function openSetup() {
    setSetupInstallationId(String(setup.installation_id ?? ''));
    setSetupOrigin(String(setup.consumer_origin ?? window.location.origin));
    setSetupKey('');
    setSetupOpen(true);
  }

  async function saveSetup() {
    if (!setupInstallationId.trim()) { toast.error('Informe o identificador da instalação.'); return; }
    if (!setupOrigin.trim()) { toast.error('Informe a origem HTTPS do painel.'); return; }
    if (!setup.configured && !setupKey.trim()) { toast.error('Informe a chave interna do consumidor.'); return; }
    setSavingSetup(true);
    try {
      const updated = await configureCentralSetup({
        installation_id: setupInstallationId.trim(),
        consumer_origin: setupOrigin.trim(),
        ...(setupKey.trim() ? { internal_key: setupKey.trim() } : {}),
      });
      setSetup(updated);
      setSetupOpen(false);
      setSetupKey('');
      if (updated.last_health_ok === true) {
        toast.success('Central Nivoo configurada e validada. Agora conecte o número.');
      } else {
        toast.warn(updated.status_detail || 'Configuração salva, mas a Central ainda não confirmou o acesso. Confira o cadastro do consumidor.');
      }
    } catch (err) { toast.error(err.message); }
    finally { setSavingSetup(false); }
  }

  async function confirmDisconnect() {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      await disconnectCentralNumber(disconnectTarget.id);
      toast.success('Número desconectado na Central. O histórico foi preservado.');
      setDisconnectTarget(null);
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setDisconnecting(false); }
  }

  // ─── Vínculo assistente↔número ──────────────────────
  async function openAssistantModal(number) {
    setModalNumber(number);
    const current = bindings[number.id];
    setMAgentId(current?.agent_id || '');
    setMEnabled(current?.is_enabled ?? true);
    if (!agents.length) {
      try {
        const list = await listAgents();
        setAgents(list.filter((a) => a.is_active));
      } catch (err) { toast.error(err.message); }
    }
  }

  async function saveAssistant() {
    if (!modalNumber) return;
    if (!mAgentId) { toast.error('Escolha um assistente.'); return; }
    setSavingBind(true);
    try {
      await setNumberAssistant(modalNumber.id, { agent_id: mAgentId, is_enabled: mEnabled });
      toast.success('Assistente vinculado ao número.');
      setModalNumber(null);
      await loadBindings(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingBind(false);
    }
  }

  async function removeAssistant() {
    if (!modalNumber) return;
    setSavingBind(true);
    try {
      await removeNumberAssistant(modalNumber.id);
      toast.success('Assistente desvinculado.');
      setModalNumber(null);
      await loadBindings(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingBind(false);
    }
  }

  async function handleSync(ids, clear) {
    setSyncing(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await syncNumber(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setSyncing(false);
    clear();
    if (ok) toast.success(ok === 1 ? 'Número sincronizado com a Central.' : `${ok} números sincronizados com a Central.`);
    if (falhas.length) toast.error(`Não deu pra sincronizar ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const canManageConnections = can('integrations.connections.write');
  const configurar = canManageConnections && (
    <Button
      variant={setup.configured ? 'secondary' : 'primary'}
      icon="settings"
      title="Identificação técnica desta instalação na Central Nivoo"
      onClick={openSetup}
    >
      {setup.configured ? 'Configuração da Central' : 'Configurar Central'}
    </Button>
  );
  const conectar = canManageConnections && setup.configured && (
    <Button
      variant="primary"
      icon="plus"
      title="Abrir a autenticação oficial da Meta pela Central Nivoo em nova aba"
      loading={connecting}
      onClick={connectNumber}
    >
      Conectar número
    </Button>
  );
  const headerActions = items.length ? (
    <div className="flex items-center gap-2 flex-wrap">
      {configurar}
      {conectar}
    </div>
  ) : setup.configured ? configurar : null;

  const columns = [
    { key: 'name', header: 'Número', render: (n) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{n.name}</p>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">
          {n.phone ? formatPhone(n.phone) : n.phone_number_id ? `ID ${n.phone_number_id}` : 'telefone não informado pela Central'}
          {n.display_name ? ` · ${n.display_name}` : ''}
        </p>
      </div>
    ) },
    { key: 'status', header: 'Situação', render: (n) => {
      const st = STATUS_LABEL[n.status] || STATUS_LABEL.PENDING_AUTH;
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>
            {n.is_default && <Badge tone="info">padrão</Badge>}
          </div>
          {n.last_sync_error && (
            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-danger-fg)' }}>{n.last_sync_error}</p>
          )}
          {!n.last_sync_error && n.status_detail && (
            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>{n.status_detail}</p>
          )}
        </div>
      );
    } },
    { key: 'history', header: 'Histórico desde', render: (n) => n.history?.available_from ? formatDateTime(n.history.available_from) : 'não informado' },
    { key: 'templates', header: 'Templates', align: 'right', render: (n) => n.templates_count ?? 0 },
    { key: 'assistant', header: 'Assistente', render: (n) => {
      const b = bindings[n.id];
      return (
        <div className="flex items-center gap-2">
          {b
            ? <span style={{ fontSize: 13, color: 'var(--su-text-primary)' }}>{b.agent_name || 'assistente'}{b.is_enabled ? '' : ' (pausado)'}</span>
            : <span style={{ color: 'var(--su-text-muted)' }}>—</span>}
          {canManageAssistant && (
            <Button
              variant="ghost" size="sm" icon={b ? 'edit' : 'plus'}
              title={b ? 'Alterar ou desvincular o assistente deste número' : 'Vincular um assistente de IA a este número'}
              onClick={(e) => { e.stopPropagation(); openAssistantModal(n); }}
            >
              {b ? 'Alterar' : 'Vincular'}
            </Button>
          )}
        </div>
      );
    } },
    { key: 'health', header: 'Última checagem', render: (n) => {
      if (n.last_health_ok === null || n.last_health_ok === undefined) return '—';
      return n.last_health_ok
        ? <Badge tone="success">respondeu</Badge>
        : <Badge tone="danger">não respondeu</Badge>;
    } },
    { key: 'sync', header: 'Sincronizado', render: (n) => (n.last_sync_at ? formatDateTime(n.last_sync_at) : 'nunca') },
    { key: 'disconnect', header: 'Conexão', render: (n) => n.remote_status === 'ACTIVE' && can('integrations.connections.write') ? (
      <Button variant="danger" size="sm" title="Desregistrar este número na Central e parar os envios" onClick={(e) => { e.stopPropagation(); setDisconnectTarget(n); }}>
        Desconectar
      </Button>
    ) : '—' },
  ];

  // Só oferece sincronizar quando TODA a seleção está ativa — a Meta recusa
  // conexão desativada, e a interface deixa de propor o que não se pode fazer.
  const bulkActions = (ids, clear) => {
    const selecionados = items.filter((n) => ids.includes(n.id));
    if (!selecionados.every((n) => n.status === 'ACTIVE')) return null;
    return (
      <Button
        variant="ghost"
        icon="refresh"
        loading={syncing}
        title="Atualiza conversas e modelos pela Central"
        onClick={() => handleSync(ids, clear)}
      >
        Sincronizar agora
      </Button>
    );
  };

  return (
    <>
    <ListScreen
      title="Números"
      subtitle="Configure esta instalação uma vez e conecte cada número diretamente pela autenticação oficial da Central Nivoo."
      primaryAction={headerActions}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Buscar número…"
      loading={loading && !items.length}
      columns={columns}
      rows={rows}
      getRowId={(n) => n.id}
      bulkActions={bulkActions}
      filterActive={!!q.trim()}
      emptyNew={{
        icon: 'phone',
        title: 'Nenhum número conectado',
        description: setup.configured
          ? 'A instalação já está identificada. Abra agora a autenticação oficial da Meta pela Central Nivoo.'
          : 'Antes do primeiro número, identifique esta instalação na Central Nivoo. Essa preparação técnica é feita uma única vez.',
        action: setup.configured ? conectar : configurar,
      }}
      emptyFiltered={{ title: 'Nenhum número encontrado', description: 'Nenhum número com esse nome ou telefone.', onClear: () => setQ('') }}
    />

    <ConfirmDialog
      open={Boolean(disconnectTarget)}
      danger
      loading={disconnecting}
      title="Desconectar número"
      message={`Desregistrar ${disconnectTarget?.name || 'este número'} na Central? Envios e recebimento param. As conversas e os arquivos já armazenados permanecem disponíveis para leitura.`}
      confirmLabel="Desconectar"
      onClose={() => !disconnecting && setDisconnectTarget(null)}
      onConfirm={confirmDisconnect}
    />

    <Modal
      open={setupOpen}
      onClose={() => (savingSetup ? null : setSetupOpen(false))}
      title="Configuração da Central Nivoo"
      maxWidth={560}
      footer={
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" disabled={savingSetup} onClick={() => setSetupOpen(false)}>Cancelar</Button>
          <Button variant="primary" loading={savingSetup} onClick={saveSetup}>Salvar e validar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p style={{ fontSize: 13, color: 'var(--su-text-secondary)', margin: 0 }}>
          Esta etapa apenas identifica o IA Studio perante a Central. Depois de validada, o botão
          “Conectar número” abre diretamente a autenticação da Meta na Central Nivoo.
        </p>
        <Field label="Identificador da instalação" required hint="O mesmo installation_id cadastrado em Plataforma → Consumidores integradores na Central.">
          <Input
            value={setupInstallationId}
            onChange={(e) => setSetupInstallationId(e.target.value)}
            name="nivoo-installation-id"
            autoComplete="off"
          />
        </Field>
        <Field label="Origem HTTPS do painel" required hint="Somente a origem exata, sem caminho. Ex.: https://painel.exemplo.com.br">
          <Input
            type="url"
            value={setupOrigin}
            onChange={(e) => setSetupOrigin(e.target.value)}
            name="nivoo-consumer-origin"
            autoComplete="url"
          />
        </Field>
        <Field
          label="Chave interna do consumidor"
          required={!setup.configured}
          hint={setup.configured ? 'Deixe em branco para manter a chave já cifrada no cofre.' : 'A chave fica cifrada no cofre e não volta para o navegador.'}
        >
          <Input
            type="password"
            value={setupKey}
            onChange={(e) => setSetupKey(e.target.value)}
            name="nivoo-internal-key"
            autoComplete="new-password"
          />
        </Field>
        {setup.configured && setup.last_health_ok === false && setup.status_detail && (
          <p style={{ fontSize: 12, color: 'var(--su-danger-fg)', margin: 0 }}>{setup.status_detail}</p>
        )}
      </div>
    </Modal>

    <Modal
      open={!!modalNumber}
      onClose={() => (savingBind ? null : setModalNumber(null))}
      title={modalNumber ? `Assistente de ${modalNumber.name}` : 'Assistente do número'}
      maxWidth={520}
      footer={
        <div className="flex items-center gap-2" style={{ justifyContent: 'space-between', width: '100%' }}>
          <span>
            {modalNumber && bindings[modalNumber.id] && (
              <Button variant="ghost" icon="trash" disabled={savingBind} onClick={removeAssistant}>
                Desvincular
              </Button>
            )}
          </span>
          <span className="flex items-center gap-2">
            <Button variant="secondary" disabled={savingBind} onClick={() => setModalNumber(null)}>Cancelar</Button>
            <Button variant="primary" loading={savingBind} onClick={saveAssistant}>Salvar</Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        <p style={{ fontSize: 13, color: 'var(--su-text-muted)', margin: 0 }}>
          Este assistente atende sozinho as mensagens deste número. O comportamento (responder
          automaticamente, tempo de espera, parágrafos) é configurado no próprio assistente, em IA → Assistentes → “Como conversa”.
        </p>
        <Field label="Assistente">
          <Select value={mAgentId} onChange={(e) => setMAgentId(e.target.value)}>
            <option value="">Escolha um assistente…</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Checkbox
          id="bind-enabled"
          label="Atendimento automático ligado (desmarque para pausar sem desvincular)"
          checked={mEnabled}
          onChange={(e) => setMEnabled(e.target.checked)}
        />
      </div>
    </Modal>
    </>
  );
}
