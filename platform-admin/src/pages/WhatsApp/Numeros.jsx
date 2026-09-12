import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, Modal, Field, Select, Checkbox, useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import {
  listNumbers, syncNumber,
  getNumberAssistant, setNumberAssistant, removeNumberAssistant,
} from '../../services/whatsapp';
import { listAgents } from '../../services/ai';
import { MESSAGING_LIMIT_LABEL, QUALITY, formatPhone } from './whatsapp.constants';
import { statusToTone } from '../../lib/tone';

// WhatsApp/Números — as conexões com a Meta: situação, qualidade, limite de
// conversas e sincronização. Migrada pro DS na v0.10.9.
//
// Decisões de composição:
//
//  · **Grade de cards → tabela.** Eram 9 campos empilhados num card por número;
//    numa tabela os mesmos números ficam comparáveis lado a lado, que é o que se
//    quer num painel de conexões ("qual está com qualidade baixa?").
//  · **Sincronizar saiu do card e foi pra barra de lote** — e aceita vários de
//    uma vez, o que antes exigia um clique por número. Só aparece quando toda a
//    seleção está ativa: sincronizar conexão desativada devolve erro da Meta.
//  · **A linha abre a conexão DAQUELE número** em Integrações — que é onde ela se
//    gerencia; esta tela é o painel de saúde, não o cadastro. O `id` do número é o
//    id da própria conexão (o backend deriva a lista das conexões `whatsapp-meta`),
//    então o link é direto. Na v0.10.9 a linha caía na LISTA de conexões,
//    obrigando a procurar de novo o que já tinha sido escolhido; na v0.10.10 virou
//    `?open=<id>`, e na v0.10.11 — quando a conexão ganhou rota própria — virou o
//    endereço dela. O `?open=` continua funcionando para links antigos: a tela de
//    Conexões o encaminha.
//  · O erro de sincronização fica **na célula da situação**, visível: informação
//    essencial não vive em tooltip (regra do DS).

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
  const navigate = useNavigate();
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
      const numbers = await listNumbers();
      setItems(numbers);
      loadBindings(numbers);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Vínculo de cada número (para a coluna "Assistente"). Best-effort — um número
  // sem vínculo simplesmente não aparece no mapa.
  async function loadBindings(numbers) {
    const results = await Promise.all(
      (numbers || []).map((n) =>
        getNumberAssistant(n.id).then((v) => [n.id, v]).catch(() => [n.id, null]),
      ),
    );
    const map = {};
    for (const [id, view] of results) if (view) map[id] = view;
    setBindings(map);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (ok) toast.success(ok === 1 ? 'Número sincronizado com a Meta.' : `${ok} números sincronizados com a Meta.`);
    if (falhas.length) toast.error(`Não deu pra sincronizar ${falhas.length}: ${falhas[0]}`);
    load();
  }

  const conectar = can('integrations.connections.write') && (
    <Button
      variant="primary"
      icon="plus"
      title="O cadastro de um número novo é feito pela conexão, em Integrações"
      onClick={() => navigate('/integracoes/conexoes')}
    >
      Conectar número
    </Button>
  );

  const columns = [
    { key: 'name', header: 'Número', render: (n) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{n.name}</p>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">
          {n.phone ? formatPhone(n.phone) : 'número ainda não sincronizado'}
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
    { key: 'quality', header: 'Qualidade', render: (n) => {
      const q = QUALITY[n.quality_rating] || QUALITY.UNKNOWN;
      return <Badge tone={statusToTone(q.variant)}>{q.label}</Badge>;
    } },
    { key: 'limit', header: 'Pode enviar', render: (n) => MESSAGING_LIMIT_LABEL[n.messaging_limit] || 'não informado pela Meta' },
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
        title="Pergunta à Meta agora: situação, qualidade, limite e templates"
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
      subtitle="Os números de WhatsApp conectados à Meta. A sincronização automática roda a cada 10 minutos."
      primaryAction={conectar}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Buscar número…"
      loading={loading && !items.length}
      columns={columns}
      rows={rows}
      getRowId={(n) => n.id}
      onRowClick={(n) => navigate(`/integracoes/conexoes/${n.id}`)}
      getRowLabel={(n) => `Abrir a conexão de ${n.name}`}
      bulkActions={bulkActions}
      filterActive={!!q.trim()}
      emptyNew={{
        icon: 'phone',
        title: 'Nenhum número conectado',
        description: 'Conecte um número pela conexão “WhatsApp (Meta Cloud API)”, em Integrações → Conexões. Enquanto a Meta não aprovar o cadastro rápido, a conexão é feita informando as credenciais.',
        action: conectar,
      }}
      emptyFiltered={{ title: 'Nenhum número encontrado', description: 'Nenhum número com esse nome ou telefone.', onClear: () => setQ('') }}
    />

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
