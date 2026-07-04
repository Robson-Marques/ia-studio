import React, { useEffect, useMemo, useState } from 'react';
import { Blocks, Loader2, Pencil, Plus, Power, Search } from 'lucide-react';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../components/ui/Table';
import { FormField, TextInput, Select } from '../components/ui/FormField';
import {
  listProviderDefinitions, createProviderDefinition, updateProviderDefinition,
} from '../services/marketplace';
import { toast } from '../lib/toast';

// Curadoria do marketplace (diretriz 43): CRUD de ProviderDefinition +
// ativar/desativar conector globalmente. Console = platform admin.
const CATEGORIES = [
  ['COMMUNICATION', 'Comunicação'], ['ERP', 'ERP'], ['CRM', 'CRM'],
  ['AI', 'Inteligência Artificial'], ['STORAGE', 'Armazenamento'],
  ['DATABASE', 'Banco de Dados'], ['IDENTITY', 'Identidade'],
  ['PAYMENTS', 'Pagamentos'], ['PRODUCTIVITY', 'Produtividade'],
  ['DEVELOPER', 'Desenvolvedor'], ['IOT', 'IoT'],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

const EMPTY_WIZARD = JSON.stringify(
  { testable: true, steps: [{ id: 'credentials', title: 'Credenciais', fields: [] }] },
  null,
  2,
);

export default function Marketplace() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // { editing? }
  const [toggling, setToggling] = useState(null);
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listProviderDefinitions();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.name} ${i.key} ${i.description}`.toLowerCase().includes(q));
  }, [items, search]);

  async function handleToggle() {
    if (!toggling) return;
    setActing(true);
    try {
      await updateProviderDefinition(toggling.id, { is_active: !toggling.is_active });
      toast.success(toggling.is_active ? 'Conector desativado globalmente.' : 'Conector ativado.');
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
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Marketplace — Curadoria</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Catálogo global de conectores. Desativar um conector o esconde do marketplace de todos os clientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ap-text-5)' }} />
            <input className="input pl-8 w-56" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setForm({})}>
            <Plus size={15} /> Novo conector
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !filtered.length ? (
        <div className="card">
          <EmptyState icon={Blocks} title="Nenhum conector" description="Cadastre o primeiro conector do catálogo." />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Conector</Th>
              <Th>Key</Th>
              <Th>Categoria</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {filtered.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <p className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{item.name}</p>
                    <p className="text-xs truncate max-w-md" style={{ color: 'var(--ap-text-5)' }}>{item.description}</p>
                  </Td>
                  <Td><code className="text-xs">{item.key}</code></Td>
                  <Td><Badge variant="blue">{CATEGORY_LABEL[item.category] || item.category}</Badge></Td>
                  <Td>
                    {item.is_active
                      ? <Badge variant="green">Ativo</Badge>
                      : <Badge variant="red">Desativado</Badge>}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button className="btn-ghost p-1.5" title="Editar conector" onClick={() => setForm({ editing: item })}>
                        <Pencil size={14} className="text-brand" />
                      </button>
                      <button
                        className="btn-ghost p-1.5"
                        title={item.is_active ? 'Desativar globalmente' : 'Ativar globalmente'}
                        onClick={() => setToggling(item)}
                      >
                        <Power size={14} className={item.is_active ? 'text-red-500' : 'text-emerald-500'} />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        danger={Boolean(toggling?.is_active)}
        loading={acting}
        title={toggling?.is_active ? 'Desativar conector' : 'Ativar conector'}
        message={toggling?.is_active
          ? `Desativar "${toggling?.name}" esconde o conector do marketplace de TODOS os clientes (conexões existentes não são apagadas).`
          : `Ativar "${toggling?.name}" o torna visível no marketplace de todos os clientes.`}
        confirmLabel={toggling?.is_active ? 'Desativar' : 'Ativar'}
        onClose={() => setToggling(null)}
        onConfirm={handleToggle}
      />

      <DefinitionFormModal
        open={Boolean(form)}
        editing={form?.editing}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); load(); }}
      />
    </div>
  );
}

function DefinitionFormModal({ open, editing, onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('COMMUNICATION');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [wizardJson, setWizardJson] = useState(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKey(editing?.key || '');
    setName(editing?.name || '');
    setCategory(editing?.category || 'COMMUNICATION');
    setDescription(editing?.description || '');
    setIcon(editing?.icon || '');
    setWizardJson(editing ? JSON.stringify(editing.wizard_schema || {}, null, 2) : EMPTY_WIZARD);
  }, [open, editing]);

  async function handleSave() {
    if (!name.trim()) { toast.error('Nome obrigatório.'); return; }
    if (!editing && !/^[a-z0-9][a-z0-9-]*$/.test(key.trim())) {
      toast.error('Key deve ser kebab-case (ex.: meu-conector).');
      return;
    }
    if (!description.trim()) { toast.error('Descrição obrigatória.'); return; }
    let wizardSchema;
    try {
      wizardSchema = JSON.parse(wizardJson);
    } catch {
      toast.error('Wizard schema não é um JSON válido.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        category,
        description: description.trim(),
        icon: icon.trim() || undefined,
        wizard_schema: wizardSchema,
      };
      if (editing) {
        await updateProviderDefinition(editing.id, body);
        toast.success('Conector atualizado.');
      } else {
        await createProviderDefinition({ ...body, key: key.trim() });
        toast.success('Conector criado.');
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
      title={editing ? `Editar conector — ${editing.name}` : 'Novo conector'}
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
      <div className="space-y-3">
        {editing && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)', color: 'var(--ap-text-4)' }}>
            A key <code>{editing.key}</code> é imutável — identifica o conector no Provider Registry.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!editing && (
            <FormField label="Key" required hint="kebab-case; casa com a implementação IProvider.">
              <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="meu-conector" />
            </FormField>
          )}
          <FormField label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Categoria" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </FormField>
          <FormField label="Ícone" hint="Nome do ícone (lucide).">
            <TextInput value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="plug" />
          </FormField>
        </div>
        <FormField label="Descrição" required>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Wizard schema (JSON)" required hint="Passos e campos do Connection Wizard (fields: key/label/type/secret/required/help).">
          <textarea
            className="input font-mono text-xs min-h-[180px]"
            value={wizardJson}
            onChange={(e) => setWizardJson(e.target.value)}
            spellCheck={false}
          />
        </FormField>
      </div>
    </Modal>
  );
}
