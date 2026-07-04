import React, { useEffect, useState } from 'react';
import { Flag, Plus, Loader2, Building2, SlidersHorizontal, Trash2 } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import { listFlags, createFlag, updateFlag, setFlagOverride, removeFlagOverride } from '../services/flags';
import { listOrganizations } from '../services/organizations';
import { usePermissions } from '../hooks/usePermissions';
import { toast } from '../lib/toast';

export default function Flags() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [overridesFor, setOverridesFor] = useState(null);
  const [toggling, setToggling] = useState(null); // flag aguardando ConfirmDialog
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listFlags();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle() {
    if (!toggling) return;
    setActing(true);
    try {
      await updateFlag(toggling.id, { enabled: !toggling.enabled });
      toast.success(`Flag ${toggling.enabled ? 'desligada' : 'ligada'} globalmente.`);
      setToggling(null);
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
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Feature Flags</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Flags globais da plataforma + overrides por organização. Mudanças valem imediatamente.
          </p>
        </div>
        {can('console.flags.create') && (
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Nova flag
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={Flag} title="Nenhuma flag" description="Crie uma flag global para controlar recursos da plataforma." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Chave</Th><Th>Descrição</Th><Th>Global</Th><Th>Overrides</Th><Th className="text-right">Ações</Th>
                </Thead>
                <Tbody>
                  {items.map((f) => (
                    <Tr key={f.id}>
                      <Td><code className="text-xs font-medium">{f.key}</code></Td>
                      <Td>{f.description || '—'}</Td>
                      <Td>
                        {can('console.flags.update') ? (
                          <button onClick={() => setToggling(f)} title="Alternar valor global da flag">
                            <FlagSwitch on={Boolean(f.enabled)} />
                          </button>
                        ) : (
                          <FlagSwitch on={Boolean(f.enabled)} />
                        )}
                      </Td>
                      <Td>
                        <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                          {(f.overrides || []).length} organização(ões)
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end">
                          {can('console.flags.update') && (
                            <button
                              className="btn-ghost p-1.5"
                              title="Gerenciar overrides por organização"
                              onClick={() => setOverridesFor(f)}
                            >
                              <SlidersHorizontal size={15} className="text-brand" />
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
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {items.map((f) => (
                <div key={f.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <code className="text-xs font-medium" style={{ color: 'var(--ap-text-1)' }}>{f.key}</code>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ap-text-4)' }}>{f.description || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {can('console.flags.update') && (
                      <button className="btn-ghost p-2" onClick={() => setOverridesFor(f)} aria-label="Overrides">
                        <SlidersHorizontal size={16} className="text-brand" />
                      </button>
                    )}
                    <button onClick={() => can('console.flags.update') && setToggling(f)} aria-label="Alternar">
                      <FlagSwitch on={Boolean(f.enabled)} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <FlagFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      <OverridesModal
        flag={overridesFor}
        onClose={() => setOverridesFor(null)}
        onChanged={load}
      />

      <ConfirmDialog
        open={Boolean(toggling)}
        danger={Boolean(toggling?.enabled)}
        loading={acting}
        title={toggling?.enabled ? 'Desligar flag global' : 'Ligar flag global'}
        message={`${toggling?.enabled ? 'Desligar' : 'Ligar'} a flag "${toggling?.key}" globalmente? Vale para todas as organizações sem override.`}
        confirmLabel={toggling?.enabled ? 'Desligar' : 'Ligar'}
        onClose={() => !acting && setToggling(null)}
        onConfirm={handleToggle}
      />
    </div>
  );
}

function FlagSwitch({ on }) {
  return (
    <span
      className="inline-flex items-center w-10 h-[22px] rounded-full transition-colors relative"
      style={{ backgroundColor: on ? 'var(--ap-accent)' : 'var(--ap-surface-3)', border: '1px solid var(--ap-border)' }}
    >
      <span
        className="w-4 h-4 rounded-full bg-white shadow absolute transition-all"
        style={{ left: on ? 'calc(100% - 18px)' : '2px' }}
      />
    </span>
  );
}

function FlagFormModal({ open, onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setKey(''); setDescription(''); setEnabled(false); }
  }, [open]);

  async function handleSave() {
    if (!key.trim()) { toast.error('Chave obrigatória.'); return; }
    setSaving(true);
    try {
      await createFlag({ key: key.trim(), description: description.trim(), enabled });
      toast.success('Flag criada.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title="Nova flag"
      size="md"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Criar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Chave" required hint="UPPER_SNAKE_CASE, ex.: MARKETPLACE_BETA">
          <TextInput value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} placeholder="MINHA_FLAG" autoFocus />
        </FormField>
        <FormField label="Descrição">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que esta flag controla" />
        </FormField>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[var(--ap-accent)] w-4 h-4"
          />
          <span className="text-sm" style={{ color: 'var(--ap-text-2)' }}>Ligada globalmente ao criar</span>
        </label>
        <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>
          Recomendação: todo comportamento automático nasce desligado e é ligado por toggle depois.
        </p>
      </div>
    </Modal>
  );
}

function OverridesModal({ flag, onClose, onChanged }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [value, setValue] = useState('on');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [acting, setActing] = useState(false);
  const [localOverrides, setLocalOverrides] = useState([]);

  useEffect(() => {
    if (!flag) return;
    setOrgId('');
    setValue('on');
    setLocalOverrides(flag.overrides || []);
    setLoading(true);
    listOrganizations()
      .then(({ items }) => setOrgs(items))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [flag]);

  if (!flag) return null;

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || id;

  async function handleAdd() {
    if (!orgId) { toast.error('Selecione a organização.'); return; }
    setSaving(true);
    try {
      await setFlagOverride(flag.id, orgId, value === 'on');
      toast.success('Override salvo.');
      setLocalOverrides((prev) => {
        const rest = prev.filter((o) => (o.organization_id || o.org_id) !== orgId);
        return [...rest, { organization_id: orgId, enabled: value === 'on' }];
      });
      setOrgId('');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setActing(true);
    try {
      await removeFlagOverride(flag.id, removing.organization_id || removing.org_id);
      toast.success('Override removido — a organização volta a seguir o valor global.');
      setLocalOverrides((prev) => prev.filter((o) => o !== removing));
      setRemoving(null);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <Modal
      open={Boolean(flag)}
      onClose={onClose}
      title={`Overrides — ${flag.key}`}
      size="lg"
      footer={<button className="btn-secondary" onClick={onClose}>Fechar</button>}
    >
      <div className="space-y-4">
        <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
          Override força um valor para a organização, ignorando o global
          ({flag.enabled ? 'ligada' : 'desligada'}). Sem override, ela segue o global.
        </p>

        {/* Adicionar override */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto] gap-2 items-end">
          <FormField label="Organização">
            <Select value={orgId} onChange={(e) => setOrgId(e.target.value)} disabled={loading}>
              <option value="">{loading ? 'Carregando…' : 'Selecione…'}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Valor">
            <Select value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="on">Ligada</option>
              <option value="off">Desligada</option>
            </Select>
          </FormField>
          <button className="btn-primary disabled:opacity-60" onClick={handleAdd} disabled={saving} title="Salvar override para a organização selecionada">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Aplicar
          </button>
        </div>

        {/* Lista de overrides */}
        {!localOverrides.length ? (
          <EmptyState icon={Building2} title="Sem overrides" description="Todas as organizações seguem o valor global." />
        ) : (
          <div className="space-y-1.5">
            {localOverrides.map((ov, i) => (
              <div
                key={ov.organization_id || ov.org_id || i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}
              >
                <Building2 size={14} style={{ color: 'var(--ap-text-4)' }} />
                <span className="text-sm flex-1 truncate" style={{ color: 'var(--ap-text-2)' }}>
                  {ov.organization_name || ov.organization?.name || orgName(ov.organization_id || ov.org_id)}
                </span>
                <Badge variant={ov.enabled ? 'green' : 'red'}>{ov.enabled ? 'Ligada' : 'Desligada'}</Badge>
                <button
                  className="btn-ghost p-1"
                  title="Remover override (volta a seguir o global)"
                  onClick={() => setRemoving(ov)}
                >
                  <Trash2 size={14} className="text-red-500" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        danger
        loading={acting}
        title="Remover override"
        message="Remover este override? A organização volta a seguir o valor global da flag imediatamente."
        confirmLabel="Remover"
        onClose={() => !acting && setRemoving(null)}
        onConfirm={handleRemove}
      />
    </Modal>
  );
}
