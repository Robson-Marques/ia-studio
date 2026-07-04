import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Loader2 } from 'lucide-react';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge, Pagination } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import { listOrganizations, createOrganization } from '../services/organizations';
import { listPlans } from '../services/plans';
import { usePermissions } from '../hooks/usePermissions';
import { formatDate } from '../lib/format';
import { toast } from '../lib/toast';

const PER_PAGE = 15;

export const LICENSE_BADGE = {
  TRIAL:      { label: 'Trial',     variant: 'blue' },
  ACTIVE:     { label: 'Ativa',     variant: 'green' },
  RESTRICTED: { label: 'Restrita',  variant: 'yellow' },
  SUSPENDED:  { label: 'Suspensa',  variant: 'red' },
  EXPIRED:    { label: 'Expirada',  variant: 'red' },
  CANCELLED:  { label: 'Cancelada', variant: 'gray' },
};

export function licenseBadge(status) {
  const info = LICENSE_BADGE[status] || { label: status || '—', variant: 'gray' };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export default function Clientes() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ items: orgs }, { items: pls }] = await Promise.all([
        listOrganizations(),
        listPlans().catch(() => ({ items: [] })),
      ]);
      setItems(orgs);
      setPlans(pls);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const paged = useMemo(
    () => items.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [items, page],
  );

  const planName = (org) =>
    org.plan?.name || org.plan_name || org.license?.plan?.name || '—';

  const licStatus = (org) => org.license_status || org.license?.status;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Clientes</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Organizações (tenants) da plataforma.
          </p>
        </div>
        {can('console.organizations.create') && (
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} /> Novo cliente
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
        ) : !items.length ? (
          <EmptyState icon={Building2} title="Nenhum cliente" description="Cadastre a primeira organização da plataforma." />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Nome</Th><Th>Slug</Th><Th>Plano</Th><Th>Licença</Th><Th>Criado em</Th>
                </Thead>
                <Tbody>
                  {paged.map((org) => (
                    <Tr key={org.id} onClick={() => navigate(`/clientes/${org.id}`)}>
                      <Td className="font-medium">{org.name}</Td>
                      <Td><code className="text-xs">{org.slug}</code></Td>
                      <Td>{planName(org)}</Td>
                      <Td>{licenseBadge(licStatus(org))}</Td>
                      <Td>{formatDate(org.created_at)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              <Pagination page={page} total={items.length} perPage={PER_PAGE} onPage={setPage} />
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y px-4" style={{ borderColor: 'var(--ap-border)' }}>
              {paged.map((org) => (
                <button
                  key={org.id}
                  className="w-full text-left py-3 flex items-start gap-3"
                  onClick={() => navigate(`/clientes/${org.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{org.name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>
                      {org.slug} · {planName(org)}
                    </p>
                  </div>
                  <div className="shrink-0">{licenseBadge(licStatus(org))}</div>
                </button>
              ))}
              <Pagination page={page} total={items.length} perPage={PER_PAGE} onPage={setPage} />
            </div>
          </>
        )}
      </div>

      <OrgFormModal
        open={formOpen}
        plans={plans}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />
    </div>
  );
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OrgFormModal({ open, plans, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [planId, setPlanId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setSlug(''); setSlugTouched(false); setPlanId(''); }
  }, [open]);

  function handleName(v) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!slug.trim()) { toast.error('Slug obrigatório.'); return; }
    if (!planId) { toast.error('Selecione o plano inicial.'); return; }
    setSaving(true);
    try {
      await createOrganization({ name: name.trim(), slug: slug.trim(), plan_id: planId });
      toast.success('Cliente criado.');
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
      title="Novo cliente"
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
        <FormField label="Nome" required>
          <TextInput value={name} onChange={(e) => handleName(e.target.value)} placeholder="Ex.: Provedor Altarede" autoFocus />
        </FormField>
        <FormField label="Slug" required hint="Identificador único (URLs e API). Somente letras minúsculas, números e hífen.">
          <TextInput
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            placeholder="provedor-altarede"
          />
        </FormField>
        <FormField label="Plano inicial" required>
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Selecione…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
      </div>
    </Modal>
  );
}
