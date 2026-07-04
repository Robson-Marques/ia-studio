import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Pencil, Loader2 } from 'lucide-react';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, NumberInput } from '../components/ui/FormField';
import { listPlans, createPlan, updatePlan } from '../services/plans';
import { usePermissions } from '../hooks/usePermissions';
import { formatCurrency, formatLimit } from '../lib/format';
import { toast } from '../lib/toast';

// Limites do plano — vazio = ilimitado (envia null).
const LIMIT_FIELDS = [
  { key: 'users',            label: 'Usuários' },
  { key: 'workspaces',       label: 'Workspaces' },
  { key: 'agents',           label: 'Agentes' },
  { key: 'flows',            label: 'Fluxos' },
  { key: 'executions',       label: 'Execuções/mês' },
  { key: 'tokens',           label: 'Tokens/mês' },
  { key: 'whatsapp_numbers', label: 'Números WhatsApp' },
  { key: 'google_accounts',  label: 'Contas Google' },
  { key: 'connections',      label: 'Conexões' },
];

const FEATURES = [
  { key: 'whatsapp',    label: 'WhatsApp' },
  { key: 'email',       label: 'E-mail' },
  { key: 'automation',  label: 'Automação' },
  { key: 'studio',      label: 'Studio' },
  { key: 'mcp',         label: 'MCP' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'api',         label: 'API Pública' },
  { key: 'white_label', label: 'White Label' },
  { key: 'rag',         label: 'RAG' },
  { key: 'voice',       label: 'Voz' },
  { key: 'analytics',   label: 'Analytics' },
];

export default function Planos() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listPlans();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const featureList = (p) => {
    const f = p.features || [];
    const arr = Array.isArray(f) ? f : Object.entries(f).filter(([, v]) => v).map(([k]) => k);
    return arr;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Planos</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Planos comerciais — limites e recursos aplicados via licença.
          </p>
        </div>
        {can('console.plans.create') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={15} /> Novo plano
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={CreditCard} title="Nenhum plano" description="Crie o primeiro plano comercial da plataforma." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Nome</Th><Th>Preço</Th><Th>Trial</Th><Th>Usuários</Th><Th>Execuções/mês</Th><Th>Recursos</Th><Th className="text-right">Ações</Th>
                </Thead>
                <Tbody>
                  {items.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium">{p.name}</Td>
                      <Td>{formatCurrency(p.price)}</Td>
                      <Td>{p.trial_days ? `${p.trial_days} dias` : '—'}</Td>
                      <Td>{formatLimit(p.limits?.users)}</Td>
                      <Td>{formatLimit(p.limits?.executions)}</Td>
                      <Td>
                        <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                          {featureList(p).length} recurso(s)
                        </span>
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end">
                          {can('console.plans.update') && (
                            <button className="btn-ghost p-1.5" title="Editar plano" onClick={() => { setEditing(p); setFormOpen(true); }}>
                              <Pencil size={15} className="text-brand" />
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
              {items.map((p) => (
                <div key={p.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
                      {formatCurrency(p.price)}{p.trial_days ? ` · trial ${p.trial_days}d` : ''}
                    </p>
                    <div className="mt-1.5">
                      <Badge variant="gray">{featureList(p).length} recurso(s)</Badge>
                    </div>
                  </div>
                  {can('console.plans.update') && (
                    <button className="btn-ghost p-2.5 shrink-0" onClick={() => { setEditing(p); setFormOpen(true); }} aria-label="Editar">
                      <Pencil size={16} className="text-brand" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <PlanFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />
    </div>
  );
}

function PlanFormModal({ open, editing, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [trialDays, setTrialDays] = useState(0);
  const [limits, setLimits] = useState({});
  const [features, setFeatures] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setPrice(editing?.price ?? 0);
    setTrialDays(editing?.trial_days ?? 0);
    setLimits(editing?.limits ? { ...editing.limits } : {});
    const f = editing?.features || [];
    const arr = Array.isArray(f) ? f : Object.entries(f).filter(([, v]) => v).map(([k]) => k);
    setFeatures(new Set(arr));
  }, [open, editing]);

  function setLimit(key, value) {
    setLimits((l) => ({ ...l, [key]: value }));
  }

  function toggleFeature(key) {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        price: price ?? 0,
        trial_days: trialDays ?? 0,
        limits: Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, limits[key] ?? null])),
        features: Array.from(features),
      };
      if (editing) {
        await updatePlan(editing.id, body);
        toast.success('Plano atualizado.');
      } else {
        await createPlan(body);
        toast.success('Plano criado.');
      }
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
      title={editing ? 'Editar plano' : 'Novo plano'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FormField label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Profissional" />
          </FormField>
          <FormField label="Preço mensal (R$)">
            <NumberInput value={price} onChange={setPrice} min={0} />
          </FormField>
          <FormField label="Dias de trial">
            <NumberInput value={trialDays} onChange={setTrialDays} min={0} step={1} />
          </FormField>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ap-text-4)' }}>
            Limites <span className="normal-case font-normal">(vazio = ilimitado)</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {LIMIT_FIELDS.map(({ key, label }) => (
              <FormField key={key} label={label}>
                <NumberInput
                  value={limits[key] ?? null}
                  onChange={(v) => setLimit(key, v)}
                  min={0}
                  step={1}
                  allowEmpty
                  placeholder="Ilimitado"
                />
              </FormField>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ap-text-4)' }}>
            Recursos
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3">
            {FEATURES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 py-1.5 cursor-pointer select-none min-h-[36px]">
                <input
                  type="checkbox"
                  checked={features.has(key)}
                  onChange={() => toggleFeature(key)}
                  className="accent-[var(--ap-accent)] w-4 h-4 shrink-0"
                />
                <span className="text-sm truncate" style={{ color: 'var(--ap-text-2)' }}>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
