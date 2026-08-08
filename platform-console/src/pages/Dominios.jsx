// Console — endereços (domínios/subdomínios) atendidos pela instalação.
// Duas naturezas na mesma tela: os endereços da PLATAFORMA (Console, API,
// painel base) e os de cada CLIENTE (subdomínio no domínio-base ou domínio
// próprio). Linguagem do usuário: "endereço", não "hostname/vhost".
import React, { useEffect, useMemo, useState } from 'react';
import { Globe, Plus, Loader2, Star, Trash2, Save, RefreshCw } from 'lucide-react';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import {
  listDomains, createDomain, setPrimaryDomain, deleteDomain,
  getBaseDomain, saveBaseDomain, activateDomain, getAutoVerify, setAutoVerify,
} from '../services/domains';
import { listOrganizations } from '../services/organizations';
import { usePermissions } from '../hooks/usePermissions';
import { toast } from '../lib/toast';

const SURFACE_LABEL = {
  ADMIN: 'Painel do cliente',
  CONSOLE: 'Console',
  API: 'API',
};

const STATUS_BADGE = {
  PENDING_DNS: { label: 'Aguardando DNS', variant: 'yellow' },
  VERIFYING: { label: 'Verificando', variant: 'blue' },
  ACTIVE: { label: 'No ar', variant: 'green' },
  FAILED: { label: 'Falhou', variant: 'red' },
  DISABLED: { label: 'Desativado', variant: 'gray' },
};

function statusBadge(status) {
  const info = STATUS_BADGE[status] || { label: status || '—', variant: 'gray' };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function Dominios() {
  const { can } = usePermissions();
  const canManage = can('console.organizations.create');
  const [items, setItems] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [base, setBase] = useState('');
  const [baseDraft, setBaseDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind:'delete'|'primary', domain }
  const [verifying, setVerifying] = useState(null); // id em verificação
  const [autoVerify, setAuto] = useState(false);
  const [savingAuto, setSavingAuto] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ items: list }, baseValue, { items: orgList }, auto] = await Promise.all([
        listDomains(),
        getBaseDomain().catch(() => ''),
        listOrganizations().catch(() => ({ items: [] })),
        getAutoVerify().catch(() => false),
      ]);
      setItems(list);
      setBase(baseValue);
      setBaseDraft(baseValue);
      setOrgs(orgList);
      setAuto(auto);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const platform = useMemo(() => items.filter((d) => d.scope === 'PLATFORM'), [items]);
  const tenants = useMemo(() => items.filter((d) => d.scope === 'ORGANIZATION'), [items]);

  async function handleSaveBase() {
    const value = baseDraft.trim();
    if (!value) { toast.error('Informe o domínio-base.'); return; }
    setSavingBase(true);
    try {
      const saved = await saveBaseDomain(value);
      setBase(saved);
      setBaseDraft(saved);
      toast.success('Domínio-base salvo.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingBase(false);
    }
  }

  // "Verificar e ativar": o servidor confere o DNS, publica o endereço e emite o
  // certificado. É assíncrono — relemos a lista depois de alguns segundos para
  // pegar a situação que o servidor gravou.
  async function handleActivate(domain) {
    setVerifying(domain.id);
    try {
      await activateDomain(domain.id);
      toast.info('Verificando o endereço… isso leva alguns segundos.');
      setTimeout(() => { load().finally(() => setVerifying(null)); }, 8000);
    } catch (err) {
      toast.error(err.message);
      setVerifying(null);
    }
  }

  async function handleToggleAuto() {
    const next = !autoVerify;
    setSavingAuto(true);
    try {
      const saved = await setAutoVerify(next);
      setAuto(saved);
      toast.success(saved ? 'Reverificação automática ligada.' : 'Reverificação automática desligada.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAuto(false);
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm.kind === 'delete') {
        await deleteDomain(confirm.domain.id);
        toast.success('Endereço removido.');
      } else {
        await setPrimaryDomain(confirm.domain.id);
        toast.success('Endereço principal atualizado.');
      }
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Endereços</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Por quais endereços a plataforma e cada cliente são atendidos. Um cliente pode usar um
            subdomínio seu ou o domínio próprio dele.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Novo endereço
          </button>
        )}
      </div>

      {/* Domínio-base: pai dos subdomínios dos clientes */}
      <div className="card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ap-text-1)' }}>Domínio-base</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            É sob ele que nascem os subdomínios dos clientes (cliente → <code>cliente.{base || 'seudominio.com.br'}</code>).
            Endereço fora dele é tratado como domínio próprio do cliente e precisa de verificação.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Endereço base" className="flex-1 min-w-[240px]">
            <TextInput
              value={baseDraft}
              disabled={!canManage}
              placeholder="app.suaempresa.com.br"
              onChange={(e) => setBaseDraft(e.target.value)}
            />
          </FormField>
          {canManage && (
            <button
              className="btn-primary disabled:opacity-60"
              onClick={handleSaveBase}
              disabled={savingBase || baseDraft.trim() === base}
              title="Salvar o domínio-base da instalação"
            >
              {savingBase ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          )}
        </div>
        {!base && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Sem o domínio-base não é possível criar subdomínio por nome — só cadastrar endereço completo.
          </p>
        )}

        {/* Reverificação automática: propagação de DNS demora, então o sistema
            volta a tentar sozinho. Nasce desligada (regra: automatismo é opt-in). */}
        <label className="flex items-start gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={autoVerify}
            disabled={!canManage || savingAuto}
            onChange={handleToggleAuto}
            className="mt-0.5"
          />
          <span className="text-xs" style={{ color: 'var(--ap-text-3)' }}>
            <b>Verificar sozinho os endereços pendentes</b> — a cada 30 minutos o sistema tenta de novo
            publicar quem ainda está aguardando DNS, e coloca no ar assim que o apontamento propagar.
          </span>
        </label>
      </div>

      {loading ? (
        <div className="card flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
        </div>
      ) : (
        <>
          <DomainTable
            title="Da plataforma"
            hint="Console, API e o painel base — os endereços do próprio SaaS."
            rows={platform}
            orgs={orgs}
            canManage={canManage}
            verifying={verifying}
            onActivate={handleActivate}
            onPrimary={(d) => setConfirm({ kind: 'primary', domain: d })}
            onDelete={(d) => setConfirm({ kind: 'delete', domain: d })}
          />
          <DomainTable
            title="Dos clientes"
            hint="Subdomínio no seu domínio-base ou domínio próprio do cliente."
            rows={tenants}
            orgs={orgs}
            canManage={canManage}
            verifying={verifying}
            onActivate={handleActivate}
            onPrimary={(d) => setConfirm({ kind: 'primary', domain: d })}
            onDelete={(d) => setConfirm({ kind: 'delete', domain: d })}
          />
        </>
      )}

      <DomainFormModal
        open={formOpen}
        orgs={orgs}
        base={base}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <ConfirmDialog
        open={!!confirm}
        danger={confirm?.kind === 'delete'}
        loading={acting}
        title={confirm?.kind === 'delete' ? 'Remover endereço' : 'Definir como principal'}
        message={
          confirm?.kind === 'delete'
            ? `Remover "${confirm?.domain?.hostname}"? Quem acessar por ele deixa de ser atendido. O apontamento de DNS continua existindo do lado de quem o criou.`
            : `Tornar "${confirm?.domain?.hostname}" o endereço principal? É o endereço canônico usado nas comunicações do sistema.`
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Remover' : 'Definir como principal'}
        onClose={() => (acting ? undefined : setConfirm(null))}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function DomainTable({ title, hint, rows, orgs, canManage, verifying, onActivate, onPrimary, onDelete }) {
  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '—';
  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-bold" style={{ color: 'var(--ap-text-1)' }}>{title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{hint}</p>
      </div>
      {!rows.length ? (
        <EmptyState icon={Globe} title="Nenhum endereço" description="Cadastre o primeiro endereço deste grupo." />
      ) : (
        <div className="mt-3">
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <Thead>
                <Th>Endereço</Th><Th>Serve</Th><Th>Cliente</Th><Th>Tipo</Th><Th>Situação</Th><Th></Th>
              </Thead>
              <Tbody>
                {rows.map((d) => (
                  <Tr key={d.id}>
                    <Td className="font-medium">
                      {d.hostname}{' '}
                      {d.is_primary && <Badge variant="blue">principal</Badge>}
                    </Td>
                    <Td>{SURFACE_LABEL[d.surface] || d.surface}</Td>
                    <Td>{d.organization_id ? orgName(d.organization_id) : '—'}</Td>
                    <Td>{d.kind === 'SUBDOMAIN' ? 'Subdomínio' : 'Domínio próprio'}</Td>
                    <Td>
                      {statusBadge(d.status)}
                      {d.last_error && d.status !== 'ACTIVE' && (
                        <p className="text-[11px] mt-1 max-w-[280px]" style={{ color: 'var(--ap-text-4)' }} title={d.last_error}>
                          {d.last_error.length > 90 ? `${d.last_error.slice(0, 90)}…` : d.last_error}
                        </p>
                      )}
                    </Td>
                    <Td>
                      {canManage && (
                        <div className="flex items-center gap-2 justify-end">
                          {d.status !== 'ACTIVE' && (
                            <button
                              title="Verificar o DNS, publicar o endereço e emitir o certificado"
                              className="btn-secondary text-xs disabled:opacity-60"
                              disabled={verifying === d.id}
                              onClick={() => onActivate(d)}
                            >
                              {verifying === d.id
                                ? <><Loader2 size={13} className="animate-spin" /> Verificando…</>
                                : <><RefreshCw size={13} /> Verificar e ativar</>}
                            </button>
                          )}
                          {!d.is_primary && (
                            <button title="Definir como principal" className="text-brand" onClick={() => onPrimary(d)}>
                              <Star size={15} />
                            </button>
                          )}
                          <button title="Remover endereço" className="text-red-500" onClick={() => onDelete(d)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
            {rows.map((d) => (
              <div key={d.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>
                    {d.hostname}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>
                    {SURFACE_LABEL[d.surface] || d.surface}
                    {d.organization_id ? ` · ${orgName(d.organization_id)}` : ''}
                    {d.is_primary ? ' · principal' : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {statusBadge(d.status)}
                  {canManage && d.status !== 'ACTIVE' && (
                    <button
                      title="Verificar e ativar"
                      className="text-brand disabled:opacity-60"
                      disabled={verifying === d.id}
                      onClick={() => onActivate(d)}
                    >
                      <RefreshCw size={15} className={verifying === d.id ? 'animate-spin' : ''} />
                    </button>
                  )}
                  {canManage && (
                    <button title="Remover endereço" className="text-red-500" onClick={() => onDelete(d)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DomainFormModal({ open, orgs, base, onClose, onSaved }) {
  const [mode, setMode] = useState('subdomain'); // subdomain | custom
  const [label, setLabel] = useState('');
  const [hostname, setHostname] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [surface, setSurface] = useState('ADMIN');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(base ? 'subdomain' : 'custom');
    setLabel(''); setHostname(''); setOrganizationId(''); setSurface('ADMIN');
  }, [open, base]);

  async function handleSave() {
    if (mode === 'subdomain' && !label.trim()) { toast.error('Informe o nome do subdomínio.'); return; }
    if (mode === 'custom' && !hostname.trim()) { toast.error('Informe o endereço completo.'); return; }
    setSaving(true);
    try {
      await createDomain({
        ...(mode === 'subdomain' ? { label: label.trim() } : { hostname: hostname.trim() }),
        organization_id: organizationId || null,
        surface,
      });
      toast.success('Endereço cadastrado.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const preview = mode === 'subdomain' && label.trim() && base ? `${label.trim()}.${base}` : null;

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title="Novo endereço"
      size="md"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Cadastrar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Tipo de endereço">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="subdomain" disabled={!base}>
              Subdomínio no meu domínio-base{base ? '' : ' (defina o domínio-base primeiro)'}
            </option>
            <option value="custom">Domínio próprio (do cliente)</option>
          </Select>
        </FormField>

        {mode === 'subdomain' ? (
          <FormField
            label="Nome do subdomínio"
            hint={preview ? `Ficará: ${preview}` : 'Só o nome — o restante vem do domínio-base.'}
          >
            <TextInput value={label} placeholder="cliente" onChange={(e) => setLabel(e.target.value)} />
          </FormField>
        ) : (
          <FormField label="Endereço completo" hint="Precisa apontar para esta instalação e será verificado antes de entrar no ar.">
            <TextInput value={hostname} placeholder="painel.cliente.com.br" onChange={(e) => setHostname(e.target.value)} />
          </FormField>
        )}

        <FormField label="Quem é atendido" hint="Sem cliente = endereço da própria plataforma (Console, API ou painel base).">
          <Select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">Plataforma (Console / API)</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </FormField>

        <FormField label="Serve">
          <Select value={surface} onChange={(e) => setSurface(e.target.value)}>
            <option value="ADMIN">Painel do cliente</option>
            <option value="CONSOLE">Console</option>
            <option value="API">API</option>
          </Select>
        </FormField>

        <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--ap-surface-3)', color: 'var(--ap-text-4)' }}>
          O endereço entra como <b>aguardando DNS</b>. Ele só passa a atender depois do apontamento —
          e, no caso de domínio próprio, também do certificado.
        </p>
      </div>
    </Modal>
  );
}
