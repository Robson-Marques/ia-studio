import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, Boxes, KeyRound, Gauge, Pencil, Loader2, Copy, RefreshCw,
  Users, ShieldCheck, KeySquare,
} from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import { getOrganization, updateOrganization } from '../services/organizations';
import { listOrgUsers, updateOrgUser, resetOrgUserPassword } from '../services/orgUsers';
import { getLicense, updateLicense } from '../services/licenses';
import { listPlans } from '../services/plans';
import { usePermissions } from '../hooks/usePermissions';
import { formatDate, formatNumber, formatLimit } from '../lib/format';
import { licenseBadge, LICENSE_BADGE } from './Clientes';
import { toast } from '../lib/toast';

const TABS = [
  { id: 'dados',      label: 'Dados',      Icon: Building2 },
  { id: 'usuarios',   label: 'Usuários',   Icon: Users },
  { id: 'workspaces', label: 'Workspaces', Icon: Boxes },
  { id: 'licenca',    label: 'Licença',    Icon: KeyRound },
  { id: 'uso',        label: 'Uso do mês', Icon: Gauge },
];

const METRIC_LABELS = {
  users: 'Usuários', workspaces: 'Workspaces', agents: 'Agentes', flows: 'Fluxos',
  executions: 'Execuções (mês)', tokens: 'Tokens (mês)', whatsapp_numbers: 'Números WhatsApp',
  google_accounts: 'Contas Google', connections: 'Conexões',
};

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dados');
  const [org, setOrg] = useState(null);
  const [license, setLicense] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [orgData, lic, { items: pls }] = await Promise.all([
        getOrganization(id),
        getLicense(id).catch(() => null),
        listPlans().catch(() => ({ items: [] })),
      ]);
      setOrg(orgData);
      setLicense(lic);
      setPlans(pls);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
      </div>
    );
  }

  if (!org) {
    return <EmptyState icon={Building2} title="Cliente não encontrado" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn-ghost" onClick={() => navigate('/clientes')}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{org.name}</h1>
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            <code>{org.slug}</code> · criado em {formatDate(org.created_at)}
          </p>
        </div>
        {licenseBadge(license?.status || org.license_status)}
      </div>

      <div className="card px-5 pt-4 pb-5">
        <Tabs items={TABS} active={tab} onChange={setTab} />
        {tab === 'dados'      && <TabDados org={org} onSaved={load} />}
        {tab === 'usuarios'   && <TabUsuarios orgId={id} />}
        {tab === 'workspaces' && <TabWorkspaces org={org} />}
        {tab === 'licenca'    && <TabLicenca orgId={id} license={license} plans={plans} onChanged={load} />}
        {tab === 'uso'        && <TabUso license={license} />}
      </div>
    </div>
  );
}

/* ───────────────────────── Dados ───────────────────────── */

function TabDados({ org, onSaved }) {
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (editOpen) setName(org.name); }, [editOpen, org.name]);

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    setSaving(true);
    try {
      await updateOrganization(org.id, { name: name.trim() });
      toast.success('Cliente atualizado.');
      setEditOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const rows = [
    ['Nome', org.name],
    ['Slug', org.slug],
    ['Status', org.is_active === false ? 'Inativo' : 'Ativo'],
    ['Criado em', formatDate(org.created_at)],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>{label}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--ap-text-1)' }}>{value ?? '—'}</p>
          </div>
        ))}
      </div>
      {can('console.organizations.update') && (
        <button className="btn-secondary" onClick={() => setEditOpen(true)} title="Editar dados do cliente">
          <Pencil size={14} className="text-brand" /> Editar
        </button>
      )}

      <Modal
        open={editOpen}
        onClose={saving ? undefined : () => setEditOpen(false)}
        dismissable={!saving}
        title="Editar cliente"
        size="sm"
        footer={
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-4)' }}>
            O slug não pode ser alterado após a criação.
          </p>
          <FormField label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

/* ─────────────────────── Workspaces ─────────────────────── */

function TabWorkspaces({ org }) {
  const workspaces = org.workspaces || [];
  if (!workspaces.length) {
    return <EmptyState icon={Boxes} title="Nenhum workspace" description="O cliente ainda não criou workspaces." />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {workspaces.map((ws) => (
        <div key={ws.id} className="px-4 py-3 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}>
          <Boxes size={16} className="text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{ws.name}</p>
            <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>
              {(ws.environments || []).length} ambiente(s)
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Usuários ───────────────────────── */

function TabUsuarios({ orgId }) {
  const { can } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // usuario em edicao (nome/e-mail)
  const [resetting, setResetting] = useState(null); // usuario em reset de senha

  async function load() {
    setLoading(true);
    try {
      const { items } = await listOrgUsers(orgId);
      setUsers(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
      </div>
    );
  }

  if (!users.length) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum usuário"
        description="Este cliente ainda não possui usuários ativos cadastrados."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
        Gestão dos usuários deste cliente. Você pode ajustar nome/e-mail e redefinir a senha —
        o reset de senha desconecta o usuário das sessões atuais.
      </p>

      {/* Desktop */}
      <div className="hidden md:block">
        <Table>
          <Thead>
            <Th>Usuário</Th>
            <Th>E-mail</Th>
            <Th>Status</Th>
            <Th className="text-right">Ações</Th>
          </Thead>
          <Tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--ap-text-1)' }}>{u.name}</span>
                    {u.is_platform_admin && (
                      <span title="Administrador da plataforma">
                        <ShieldCheck size={13} className="text-brand" />
                      </span>
                    )}
                  </div>
                </Td>
                <Td><span className="text-sm" style={{ color: 'var(--ap-text-2)' }}>{u.email}</span></Td>
                <Td>
                  <Badge variant={u.is_active ? 'green' : 'gray'}>
                    {u.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {can('console.organizations.update') && (
                      <button
                        className="btn-ghost !px-2 !py-1.5"
                        onClick={() => setEditing(u)}
                        title="Editar nome e e-mail"
                      >
                        <Pencil size={14} className="text-brand" />
                      </button>
                    )}
                    {can('console.organizations.update') && (
                      <button
                        className="btn-ghost !px-2 !py-1.5"
                        onClick={() => setResetting(u)}
                        title="Redefinir a senha deste usuário"
                      >
                        <KeySquare size={14} className="text-amber-500" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
        {users.map((u) => (
          <div key={u.id} className="py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{u.name}</p>
                  {u.is_platform_admin && <ShieldCheck size={13} className="text-brand shrink-0" />}
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{u.email}</p>
              </div>
              <Badge variant={u.is_active ? 'green' : 'gray'}>{u.is_active ? 'Ativo' : 'Inativo'}</Badge>
            </div>
            {can('console.organizations.update') && (
              <div className="flex items-center gap-2">
                <button className="btn-secondary flex-1" onClick={() => setEditing(u)} title="Editar nome e e-mail">
                  <Pencil size={13} className="text-brand" /> Editar
                </button>
                <button className="btn-secondary flex-1" onClick={() => setResetting(u)} title="Redefinir a senha deste usuário">
                  <KeySquare size={13} className="text-amber-500" /> Senha
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <EditUserModal
          orgId={orgId}
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          orgId={orgId}
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => setResetting(null)}
        />
      )}
    </div>
  );
}

function EditUserModal({ orgId, user, onClose, onSaved }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!email.trim()) { toast.error('E-mail obrigatório.'); return; }
    const body = {};
    if (name.trim() !== user.name) body.name = name.trim();
    if (email.trim() !== user.email) body.email = email.trim();
    if (!Object.keys(body).length) { toast.info('Nenhuma alteração para salvar.'); onClose(); return; }
    setSaving(true);
    try {
      await updateOrgUser(orgId, user.id, body);
      toast.success('Usuário atualizado.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title="Editar usuário"
      size="sm"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Nome" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="E-mail" required>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ orgId, user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleReset() {
    if (password.length < 8) { toast.error('A senha deve ter ao menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { toast.error('As senhas não coincidem.'); return; }
    setSaving(true);
    try {
      await resetOrgUserPassword(orgId, user.id, password);
      toast.success('Senha redefinida. O usuário precisará entrar novamente.');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title="Redefinir senha"
      size="sm"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-60"
            onClick={handleReset}
            disabled={saving}
            title="Grava a nova senha e desconecta as sessões atuais do usuário"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Redefinir senha
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-4)' }}>
          Ação administrativa: define uma nova senha para <b style={{ color: 'var(--ap-text-2)' }}>{user.name}</b> ({user.email}) e
          encerra as sessões ativas. Informe a nova senha ao usuário por um canal seguro.
        </p>
        <FormField label="Nova senha" required hint="Mínimo de 8 caracteres.">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirmar nova senha" required>
          <TextInput type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
        </FormField>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Licença ───────────────────────── */

function TabLicenca({ orgId, license, plans, onChanged }) {
  const { can } = usePermissions();
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(null); // { type: 'plan'|'status'|'key' }
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setPlanId(license?.plan?.id || license?.plan_id || '');
    setStatus(license?.status || '');
  }, [license]);

  if (!license) {
    return <EmptyState icon={KeyRound} title="Sem licença" description="Este cliente não possui licença registrada." />;
  }

  const key = license.key || license.license_key || '';
  const currentPlanId = license.plan?.id || license.plan_id || '';

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(key);
      toast.success('Chave copiada.');
    } catch {
      toast.error('Não foi possível copiar a chave.');
    }
  }

  async function handleConfirm() {
    setActing(true);
    try {
      if (confirm.type === 'plan') {
        await updateLicense(orgId, { plan_id: planId });
        toast.success('Plano da licença alterado.');
      } else if (confirm.type === 'status') {
        await updateLicense(orgId, { status });
        toast.success('Status da licença alterado.');
      } else {
        await updateLicense(orgId, { regenerate_key: true });
        toast.success('Nova chave gerada.');
      }
      setConfirm(null);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  const confirmContent = {
    plan: {
      title: 'Trocar plano',
      message: `Trocar o plano desta licença para "${plans.find((p) => p.id === planId)?.name || planId}"? Limites e recursos passam a valer imediatamente.`,
      danger: false,
      label: 'Trocar plano',
    },
    status: {
      title: 'Alterar status da licença',
      message: `Alterar o status da licença para "${LICENSE_BADGE[status]?.label || status}"? Isso afeta o acesso do cliente imediatamente.`,
      danger: status === 'SUSPENDED' || status === 'CANCELLED' || status === 'RESTRICTED',
      label: 'Alterar status',
    },
    key: {
      title: 'Gerar nova chave',
      message: 'Gerar uma nova chave de licença? A chave atual deixa de valer imediatamente — integrações que a utilizam precisarão ser atualizadas.',
      danger: true,
      label: 'Gerar nova chave',
    },
  };

  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
        Mudanças aqui afetam o cliente imediatamente — plano define limites e recursos; status controla o acesso.
      </p>

      {/* Chave */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>
          Chave da licença
        </p>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs truncate"
            style={{ backgroundColor: 'var(--ap-surface-3)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)' }}
          >
            <KeyRound size={13} className="shrink-0" style={{ color: 'var(--ap-text-4)' }} />
            <span className="truncate">{key || '—'}</span>
          </div>
          <button className="btn-secondary shrink-0" onClick={copyKey} title="Copiar chave">
            <Copy size={15} />
          </button>
          {can('console.licenses.update') && (
            <button
              className="btn-secondary shrink-0"
              onClick={() => setConfirm({ type: 'key' })}
              title="Gerar nova chave (invalida a atual)"
            >
              <RefreshCw size={15} className="text-red-500" />
            </button>
          )}
        </div>
      </div>

      {/* Plano */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <FormField label="Plano">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={!can('console.licenses.update')}>
              <option value="">Selecione…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </FormField>
          {can('console.licenses.update') && (
            <button
              className="btn-primary disabled:opacity-50"
              disabled={!planId || planId === currentPlanId}
              onClick={() => setConfirm({ type: 'plan' })}
              title="Aplicar o plano selecionado a esta licença"
            >
              Trocar plano
            </button>
          )}
        </div>

        {/* Status */}
        <div className="space-y-2">
          <FormField label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!can('console.licenses.update')}>
              {Object.entries(LICENSE_BADGE).map(([value, info]) => (
                <option key={value} value={value}>{info.label}</option>
              ))}
            </Select>
          </FormField>
          {can('console.licenses.update') && (
            <button
              className="btn-primary disabled:opacity-50"
              disabled={!status || status === license.status}
              onClick={() => setConfirm({ type: 'status' })}
              title="Aplicar o status selecionado a esta licença"
            >
              Alterar status
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        danger={confirm ? confirmContent[confirm.type].danger : false}
        loading={acting}
        title={confirm ? confirmContent[confirm.type].title : ''}
        message={confirm ? confirmContent[confirm.type].message : ''}
        confirmLabel={confirm ? confirmContent[confirm.type].label : 'Confirmar'}
        onClose={() => !acting && setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

/* ───────────────────────── Uso ───────────────────────── */

function TabUso({ license }) {
  const usage  = license?.usage  || {};
  const limits = license?.limits || {};
  const keys = Object.keys(METRIC_LABELS).filter((k) => k in usage || k in limits);

  if (!keys.length) {
    return <EmptyState icon={Gauge} title="Sem consumo" description="Nenhuma métrica registrada no mês corrente." />;
  }

  return (
    <div className="space-y-4">
      {keys.map((k) => {
        const used = usage[k] ?? 0;
        const limit = limits[k];
        const unlimited = limit == null;
        const pct = unlimited ? 0 : Math.min(100, (used / (limit || 1)) * 100);
        const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--ap-accent)';
        return (
          <div key={k}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>{METRIC_LABELS[k]}</p>
              <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                {formatNumber(used)} / {formatLimit(limit)}
              </p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ap-surface-3)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: unlimited ? '4%' : `${pct}%`, backgroundColor: unlimited ? 'var(--ap-text-5)' : barColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
