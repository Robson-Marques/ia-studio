import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Tabs, Card, DataTable, EmptyState, Badge, Modal, ConfirmDialog,
  Field, Input, Select, TextArea, NumericInput, Button, Checkbox, CheckGroup, useToast,
} from '@studio-ux-ds/react';
import {
  getIncident, createIncident, updateIncident,
  resolveAffected, listTargets, updateTargets,
  activateIncident, resolveIncident, dispatchIncident,
} from '../../services/isp';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { INCIDENT_STATUS, INCIDENT_MODES, SCOPE_FIELDS } from './isp.constants';

// ISP/IncidenteEditor — o incidente inteiro numa rota (v0.9.92).
//
// Rotas: /isp/incidentes/novo  ·  /isp/incidentes/:id
//
// Absorveu três overlays do legado:
//  · `IncidentModal` (tinha `TextArea` da mensagem) → é a aba **Informativo**;
//  · `TargetsModal` (tabela de afetados + resolver + vincular manual) → é a aba
//    **Afetados**. Era uma bancada inteira dentro de um Modal `size="lg"`, com
//    uma tabela de scroll interno de 320px e um form de 4 campos no rodapé;
//  · os 5 botões da linha da lista → cabeçalho desta tela, onde a decisão de
//    ativar/disparar é tomada vendo o modo e a contagem de afetados.
//
// O que **segue Modal**: o passo do disparo (só `NumericInput` de rate) e o
// `ConfirmDialog` — nenhum tem `TextArea`, e o segundo é confirmação, o caso
// canônico de overlay.

const TABS = [
  { id: 'info',     label: 'Informativo' },
  { id: 'afetados', label: 'Afetados' },
];

function blankForm() {
  return {
    title: '', message: '', forecast: '', connection_id: '', comm_mode: 'REACTIVE',
    scope: {}, suppress_os: false, inform_forecast: true, notify_normalization: false, auto_detect: false,
  };
}

export default function IncidenteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();

  const canWrite = can('isp.incidents.write');
  const canActivate = can('isp.incidents.activate');
  const canDispatch = can('isp.incidents.dispatch');

  const isEdit = !!id;
  const [incident, setIncident] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('info');

  // { kind: 'activate' | 'resolve' } — confirmação das transições de estado.
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadIncident() {
    if (!isEdit) { setForm(blankForm()); return; }
    setLoading(true);
    try {
      const inc = await getIncident(id);
      setIncident(inc);
      const t = inc.toggles || {};
      setForm({
        title: inc.title || '',
        message: inc.message || '',
        forecast: inc.forecast || '',
        connection_id: inc.connection_id || '',
        comm_mode: inc.comm_mode || 'REACTIVE',
        scope: inc.scope || {},
        suppress_os: !!t.suppress_os,
        inform_forecast: t.inform_forecast !== false,
        notify_normalization: !!t.notify_normalization,
        auto_detect: !!inc.auto_detect,
      });
    } catch (err) {
      toast.error(err.message);
      navigate('/isp/incidentes', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadIncident(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    listConnections({ workspace_id: workspaceId || undefined, environment_id: environmentId || undefined })
      .then((r) => { if (alive) setConnections((r.items || []).filter((c) => c.provider_key === 'altarede')); })
      .catch(() => { if (alive) setConnections([]); });
    return () => { alive = false; };
  }, [workspaceId, environmentId]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));
  const patchScope = (k, v) => setForm((prev) => ({ ...prev, scope: { ...prev.scope, [k]: v } }));

  const status = incident?.status || 'DRAFT';
  const isProactive = form.comm_mode !== 'REACTIVE';

  async function handleSave() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    if (!form.title.trim()) { toast.error('Informe o título.'); setTab('info'); return; }
    if (!form.connection_id) { toast.error('Selecione a conexão do provedor.'); setTab('info'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione workspace e ambiente no topo.'); return; }

    const scope = {};
    for (const f of SCOPE_FIELDS) {
      const v = (form.scope[f.key] || '').trim();
      if (v) scope[f.key] = v;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        message: form.message.trim() || undefined,
        forecast: form.forecast.trim() || undefined,
        connection_id: form.connection_id,
        comm_mode: form.comm_mode,
        scope,
        toggles: {
          suppress_os: form.suppress_os,
          inform_forecast: form.inform_forecast,
          notify_normalization: form.notify_normalization,
        },
        auto_detect: form.auto_detect,
      };
      if (isEdit) {
        await updateIncident(id, body);
        toast.success('Incidente atualizado.');
        loadIncident();
      } else {
        const saved = await createIncident({ ...body, workspace_id: workspaceId, environment_id: environmentId });
        toast.success('Incidente criado — agora resolva os afetados.');
        // Vai pra rota do incidente novo (sem recarregar) pra liberar a aba
        // Afetados e as ações de estado imediatamente.
        if (saved?.id) navigate(`/isp/incidentes/${saved.id}`, { replace: true });
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'activate') {
        const res = await activateIncident(id, { confirm: true });
        const sent = res?.dispatch?.sent;
        toast.success(sent != null ? `Incidente ativado — ${sent} avisos enviados.` : 'Incidente ativado.');
      } else {
        await resolveIncident(id, { confirm: true });
        toast.success('Incidente encerrado.');
      }
      setConfirm(null);
      loadIncident();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  const st = INCIDENT_STATUS[status] || INCIDENT_STATUS.DRAFT;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? (incident?.title || 'Incidente') : 'Novo incidente'}
        subtitle={isEdit
          ? undefined
          : 'Delimite o escopo de rede, escreva o aviso e escolha se ele é disparado ou só informado a quem procurar.'}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/isp/incidentes')} disabled={saving || busy}>
              Voltar
            </Button>

            {isEdit && canActivate && status !== 'ACTIVE' && (
              <Button
                variant={isProactive ? 'danger' : 'primary'}
                icon="check"
                title={isProactive
                  ? 'Ativar E DISPARAR o aviso em massa aos afetados incluídos'
                  : 'Ativar — o assistente passa a informar quem procurar'}
                disabled={busy}
                onClick={() => setConfirm({ kind: 'activate' })}
              >
                Ativar
              </Button>
            )}

            {isEdit && canActivate && status === 'ACTIVE' && (
              <Button
                variant="secondary"
                icon="check-circle"
                title="Encerrar o incidente (pode enviar o aviso de normalização)"
                disabled={busy}
                onClick={() => setConfirm({ kind: 'resolve' })}
              >
                Encerrar
              </Button>
            )}

            {isEdit && canWrite && status !== 'RESOLVED' && (
              <Button variant="primary" onClick={handleSave} loading={saving} icon="check">
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            )}
            {!isEdit && (
              <Button variant="primary" onClick={handleSave} loading={saving} disabled={!canWrite} icon="check">
                {saving ? 'Criando…' : 'Criar incidente'}
              </Button>
            )}
          </>
        }
      />

      {isEdit && (
        <Card>
          <div style={{ padding: 16 }} className="flex flex-wrap items-center gap-3">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>
              {incident?._count?.targets ?? 0} afetado(s) mapeado(s)
            </span>
            {isProactive && status !== 'RESOLVED' && (
              <span style={{ fontSize: 12, color: 'var(--su-warning-fg, var(--su-text-secondary))' }}>
                Modo {form.comm_mode === 'PROACTIVE' ? 'proativo' : 'combinado'}: ativar envia mensagem de verdade aos incluídos.
              </span>
            )}
          </div>
        </Card>
      )}

      {isEdit ? <Tabs items={TABS} value={tab} onChange={setTab} /> : null}

      {(!isEdit || tab === 'info') && (
        <div className="space-y-4">
          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <Field label="Título">
                <Input
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  placeholder="Manutenção programada — Bairro Centro"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Conexão do provedor" hint="ERP que descobre quem está afetado pela rede.">
                  <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })}>
                    <option value="">Selecione…</option>
                    {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Como comunicar" hint="Proativo e combinado disparam mensagem de verdade ao ativar.">
                  <Select value={form.comm_mode} onChange={(e) => patch({ comm_mode: e.target.value })}>
                    {INCIDENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Aviso ao cliente" hint="O texto que o cliente lê. Escreva como você falaria com ele.">
                <TextArea
                  rows={4}
                  value={form.message}
                  onChange={(e) => patch({ message: e.target.value })}
                  placeholder="Estamos com uma manutenção na região. Nossa equipe já está no local."
                />
              </Field>

              <div style={{ maxWidth: 360 }}>
                <Field label="Previsão de normalização">
                  <Input
                    value={form.forecast}
                    onChange={(e) => patch({ forecast: e.target.value })}
                    placeholder="Ex.: até 18h de hoje"
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  Escopo na rede
                </h2>
                <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
                  Delimita quem é considerado afetado. Preencha só o que se aplica — quanto mais específico, menos gente recebe o aviso.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SCOPE_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <Input
                      value={form.scope[f.key] || ''}
                      onChange={(e) => patchScope(f.key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <h2 id="inc-comportamento" style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Comportamento do assistente
              </h2>
              {/* `variant="card"` + `columns={4}`: as 4 opções ocupam a largura
                  do card em fronteiras visíveis, em vez de empilhar. A `meta` de
                  cada uma diz QUANDO ela se aplica — antes essa condição estava
                  entre parênteses no meio do rótulo, competindo com a leitura. */}
              <CheckGroup columns={4} role="group" aria-labelledby="inc-comportamento">
                <Checkbox
                  id="inc-suppress-os"
                  variant="card"
                  label="Não abrir chamado duplicado"
                  meta="Para clientes cobertos por este incidente"
                  checked={form.suppress_os}
                  onChange={(e) => patch({ suppress_os: e.target.checked })}
                />
                <Checkbox
                  id="inc-inform-forecast"
                  variant="card"
                  label="Informar a previsão"
                  meta="O cliente ouve o prazo de normalização"
                  checked={form.inform_forecast}
                  onChange={(e) => patch({ inform_forecast: e.target.checked })}
                />
                <Checkbox
                  id="inc-notify-normalization"
                  variant="card"
                  label="Avisar quando normalizar"
                  meta="Só nos modos proativo e combinado"
                  checked={form.notify_normalization}
                  onChange={(e) => patch({ notify_normalization: e.target.checked })}
                />
                <Checkbox
                  id="inc-auto-detect"
                  variant="card"
                  label="Detectar instabilidade sozinho"
                  meta="Só sugere um rascunho — nunca ativa por conta própria"
                  checked={form.auto_detect}
                  onChange={(e) => patch({ auto_detect: e.target.checked })}
                />
              </CheckGroup>
            </div>
          </Card>
        </div>
      )}

      {isEdit && tab === 'afetados' && (
        <AfetadosTab
          incidentId={id}
          incident={incident}
          canWrite={canWrite}
          canDispatch={canDispatch}
          onChanged={loadIncident}
        />
      )}

      {/* 5 patrasques: ConfirmDialog + disclaimer na mensagem + tooltip no botão
          + loading + gate de permissão. */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        danger={confirm?.kind === 'activate' && isProactive}
        title={confirm?.kind === 'activate' ? 'Ativar incidente' : 'Encerrar incidente'}
        confirmLabel={confirm?.kind === 'activate' ? 'Ativar' : 'Encerrar'}
        message={
          confirm?.kind === 'activate'
            ? (isProactive
                ? `Ativar em modo ${form.comm_mode === 'PROACTIVE' ? 'proativo' : 'combinado'} DISPARA o aviso por WhatsApp aos ${incident?._count?.targets ?? 0} afetado(s) incluído(s), agora. Mensagem enviada não volta atrás. Confirma?`
                : 'O incidente fica ativo e o assistente passa a informar os clientes que procurarem. Nenhuma mensagem é disparada. Confirma?')
            : 'O incidente será encerrado. Se o aviso de normalização estiver ligado (modos proativo e combinado), ele é enviado agora. Confirma?'
        }
      />
    </div>
  );
}

function AfetadosTab({ incidentId, incident, canWrite, canDispatch, onChanged }) {
  const toast = useToast();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [manual, setManual] = useState({ customer_ref: '', name: '', phone: '' });
  const [linking, setLinking] = useState(false);

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchConfirm, setDispatchConfirm] = useState(false);
  const [rate, setRate] = useState(5);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items } = await listTargets(incidentId);
      setTargets(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [incidentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await resolveAffected(incidentId);
      toast.success(`Afetados atualizados — ${res?.summary?.offline ?? 0} sem conexão de ${res?.summary?.total ?? 0}.`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResolving(false);
    }
  }

  async function toggleInclude(t) {
    const body = t.included ? { excluded_ids: [t.id] } : { included_ids: [t.id] };
    try {
      await updateTargets(incidentId, body);
      setTargets((prev) => prev.map((x) => (x.id === t.id ? { ...x, included: !x.included } : x)));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addManual() {
    if (!manual.customer_ref.trim()) { toast.error('Informe o login ou CPF do cliente.'); return; }
    setLinking(true);
    try {
      await updateTargets(incidentId, { manual: [manual] });
      setManual({ customer_ref: '', name: '', phone: '' });
      toast.success('Cliente incluído.');
      await load();
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLinking(false);
    }
  }

  async function runDispatch() {
    setBusy(true);
    try {
      const res = await dispatchIncident(incidentId, { confirm: true, rate_per_sec: rate });
      toast.success(`Disparo concluído — ${res?.sent ?? 0} enviados, ${res?.failed ?? 0} falha(s).`);
      setDispatchConfirm(false);
      setDispatchOpen(false);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const included = targets.filter((t) => t.included).length;
  const isProactive = incident?.comm_mode !== 'REACTIVE';
  const canFire = canDispatch && incident?.status === 'ACTIVE' && isProactive;

  // Coluna "Incluir": checkbox por linha porque é EDIÇÃO de um campo do
  // registro (incluir/excluir do disparo), não seleção para uma ação em lote —
  // por isso não usa `bulkActions`. A distinção está na taxonomia do DS: a
  // barra de lote é para AGIR sobre registros; aqui o clique grava um dado.
  const columns = [
    { key: 'included', header: 'Incluir', render: (t) => (
      <input
        type="checkbox"
        className="su-checkbox"
        checked={!!t.included}
        disabled={!canWrite}
        onChange={() => toggleInclude(t)}
        aria-label={`Incluir ${t.name || t.customer_ref} no disparo`}
      />
    ) },
    { key: 'customer', header: 'Cliente', render: (t) => (
      <div>
        <div style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-primary)' }}>
          {t.customer_ref}
        </div>
        {t.name && <div style={{ fontSize: 11, color: 'var(--su-text-muted)' }}>{t.name}</div>}
      </div>
    ) },
    { key: 'phone', header: 'Telefone', render: (t) => t.phone || '—' },
    { key: 'last_status', header: 'Conexão', render: (t) => t.last_status || '—' },
    { key: 'source', header: 'Origem', render: (t) => (
      <Badge tone={t.source === 'MANUAL' ? 'warning' : 'neutral'}>
        {t.source === 'MANUAL' ? 'Incluído à mão' : 'Pelo escopo'}
      </Badge>
    ) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div style={{ padding: 20 }} className="flex flex-wrap items-center gap-3">
          <p style={{ fontSize: 13, color: 'var(--su-text-secondary)', margin: 0, flex: 1, minWidth: 240 }}>
            <strong>{included}</strong> de {targets.length} vão receber o aviso. Desmarque quem não deve receber ou inclua alguém de fora da região.
          </p>
          {canWrite && (
            <Button variant="secondary" icon="refresh" loading={resolving} onClick={handleResolve}>
              {resolving ? 'Buscando…' : 'Buscar afetados no ERP'}
            </Button>
          )}
          {canFire && (
            <Button
              variant="danger"
              icon="send"
              title="Enviar o aviso por WhatsApp a todos os incluídos"
              onClick={() => setDispatchOpen(true)}
            >
              Disparar aviso
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !targets.length ? (
        <Card>
          <EmptyState
            icon="users"
            title="Nenhum afetado mapeado"
            description="Use “Buscar afetados no ERP” para encontrar quem está na região do escopo, ou inclua um cliente à mão abaixo."
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={targets} getRowId={(t) => t.id} />
      )}

      {canWrite && (
        <Card>
          <div style={{ padding: 20 }} className="space-y-3">
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Incluir um cliente à mão
              </h2>
              <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
                Para quem está afetado mas não caiu no escopo — ex.: cliente de outra região atendido pelo mesmo equipamento.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <Field label="Login ou CPF">
                <Input value={manual.customer_ref} onChange={(e) => setManual((m) => ({ ...m, customer_ref: e.target.value }))} />
              </Field>
              <Field label="Nome">
                <Input value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} />
              </Field>
              <Field label="Telefone">
                <Input value={manual.phone} onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))} />
              </Field>
              <Button variant="secondary" icon="plus" loading={linking} onClick={addManual}>
                Incluir
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Passo do disparo: só tem NumericInput — respeita a regra do Modal. */}
      <Modal
        open={dispatchOpen}
        onClose={busy ? undefined : () => setDispatchOpen(false)}
        title="Disparar aviso"
        maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDispatchOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="danger" icon="send" onClick={() => setDispatchConfirm(true)} disabled={busy}>
              Continuar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ fontSize: 14, color: 'var(--su-text-secondary)', margin: 0 }}>
            O aviso vai por WhatsApp para os <strong>{included}</strong> clientes incluídos. O limite por segundo evita
            que a operadora bloqueie o número por volume.
          </p>
          <div style={{ maxWidth: 220 }}>
            <Field label="Mensagens por segundo" hint="Entre 1 e 60. Recomendado: 5.">
              <NumericInput value={rate} onChange={(v) => setRate(v)} min={1} max={60} step={1} fullWidth />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={dispatchConfirm}
        onClose={() => setDispatchConfirm(false)}
        onConfirm={runDispatch}
        loading={busy}
        danger
        title="Confirmar o disparo"
        confirmLabel="Disparar agora"
        message={`Isto envia mensagem de WhatsApp de verdade para ${included} cliente(s), a ${rate} por segundo. Mensagem enviada não volta atrás. Confirma?`}
      />
    </div>
  );
}
