import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes, Loader2, Plus, Pencil, Trash2, Sparkles, Power, PowerOff,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select } from '../../components/ui/FormField';
import {
  getResourceCatalog, listMappings, createMapping, updateMapping, deleteMapping, suggestMapping,
} from '../../services/resource';
import { useToast } from '@studio-ux-ds/react';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';

// Recursos → Mapeamentos: CRUD de ResourceMapping. Seleciona conexão (provider) +
// tipo canônico do catálogo; editor de field_map (canonicalField → sourcePath);
// "Sugerir com IA" preenche o field_map para REVISÃO (nunca aplica sozinho);
// ativar/desativar (mapping nasce OFF). Exclusão com ConfirmDialog.
export default function Mapeamentos() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(null);

  const canWrite = can('resource.mappings.write');

  async function load() {
    setLoading(true);
    try {
      const [{ items: maps }, { items: cat }, { items: conns }] = await Promise.all([
        listMappings(),
        getResourceCatalog(),
        listConnections(),
      ]);
      setItems(maps);
      setCatalog(cat);
      setConnections(conns);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const connName = useMemo(() => {
    const map = new Map(connections.map((c) => [c.id, c.name]));
    return (id) => (id ? (map.get(id) || id) : '—');
  }, [connections]);

  const typeLabel = useMemo(() => {
    const map = new Map(catalog.map((t) => [t.type, t.label]));
    return (type) => map.get(type) || type;
  }, [catalog]);

  async function handleToggle(mapping) {
    setToggling(mapping.id);
    try {
      await updateMapping(mapping.id, { is_active: !mapping.is_active });
      toast.success(mapping.is_active ? 'Mapeamento desativado.' : 'Mapeamento ativado.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete() {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await deleteMapping(confirmDel.id);
      toast.success('Mapeamento excluído.');
      setConfirmDel(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Mapeamentos</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Traduzem a resposta de uma conexão para os tipos canônicos da plataforma. Nascem inativos — ative após revisar.
          </p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus size={15} /> Novo mapeamento
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon={Boxes} title="Nenhum mapeamento" description="Crie um mapeamento para expor recursos de uma conexão em formato canônico." />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <Table>
              <Thead>
                <Th>Tipo canônico</Th>
                <Th>Conector / Conexão</Th>
                <Th>Operação de origem</Th>
                <Th>Campos</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{typeLabel(m.resource_type)}</span>
                      <p className="text-[11px] font-mono" style={{ color: 'var(--ap-text-5)' }}>{m.resource_type}</p>
                    </Td>
                    <Td>
                      <span style={{ color: 'var(--ap-text-2)' }}>{m.provider_key}</span>
                      <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>{connName(m.connection_id)}</p>
                    </Td>
                    <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{m.source_operation}</span></Td>
                    <Td>{Object.keys(m.field_map || {}).length}</Td>
                    <Td>{m.is_active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Inativo</Badge>}</Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-0.5">
                        {canWrite && (
                          <button
                            className="btn-ghost p-1.5 disabled:opacity-40"
                            title={m.is_active ? 'Desativar' : 'Ativar'}
                            disabled={toggling === m.id}
                            onClick={() => handleToggle(m)}
                          >
                            {toggling === m.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : m.is_active
                                ? <PowerOff size={14} className="text-amber-500" />
                                : <Power size={14} className="text-emerald-500" />}
                          </button>
                        )}
                        {canWrite && (
                          <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setEditing(m); setEditorOpen(true); }}>
                            <Pencil size={14} className="text-brand" />
                          </button>
                        )}
                        {canWrite && (
                          <button className="btn-ghost p-1.5" title="Excluir" onClick={() => setConfirmDel(m)}>
                            <Trash2 size={14} className="text-red-500" />
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
          <div className="space-y-2 md:hidden">
            {items.map((m) => (
              <div key={m.id} className="card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{typeLabel(m.resource_type)}</p>
                    <p className="text-[11px] font-mono truncate" style={{ color: 'var(--ap-text-5)' }}>{m.provider_key} · {connName(m.connection_id)}</p>
                  </div>
                  {m.is_active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Inativo</Badge>}
                </div>
                <p className="text-xs mt-1.5 font-mono" style={{ color: 'var(--ap-text-3)' }}>{m.source_operation}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{Object.keys(m.field_map || {}).length} campo(s) mapeado(s)</p>
                {canWrite && (
                  <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: '1px solid var(--ap-border-sub)' }}>
                    <button className="btn-ghost p-2 disabled:opacity-40" disabled={toggling === m.id} onClick={() => handleToggle(m)}>
                      {toggling === m.id
                        ? <Loader2 size={16} className="animate-spin" />
                        : m.is_active
                          ? <PowerOff size={16} className="text-amber-500" />
                          : <Power size={16} className="text-emerald-500" />}
                    </button>
                    <button className="btn-ghost p-2" onClick={() => { setEditing(m); setEditorOpen(true); }}><Pencil size={16} className="text-brand" /></button>
                    <button className="btn-ghost p-2" onClick={() => setConfirmDel(m)}><Trash2 size={16} className="text-red-500" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <MappingModal
        open={editorOpen}
        mapping={editing}
        catalog={catalog}
        connections={connections}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />

      <ConfirmDialog
        open={Boolean(confirmDel)}
        danger
        loading={deleting}
        title="Excluir mapeamento"
        message={confirmDel ? `Excluir o mapeamento de ${typeLabel(confirmDel.resource_type)} (${confirmDel.source_operation})? Esta ação não pode ser desfeita. As integrações que dependem dele deixarão de traduzir os dados.` : ''}
        confirmLabel="Excluir"
        onClose={() => setConfirmDel(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// Editor de mapeamento — provider/conexão + tipo canônico + field_map + IA.
function MappingModal({ open, mapping, catalog, connections, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!mapping?.id;
  const [form, setForm] = useState(emptyForm());
  const [rows, setRows] = useState([]); // [{ canonical, path }]
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [sampleKeys, setSampleKeys] = useState([]);

  function emptyForm() {
    return { connection_id: '', resource_type: '', source_operation: '', description: '', is_active: false, sample_params: '' };
  }

  useEffect(() => {
    if (!open) return;
    setSampleKeys([]);
    if (mapping) {
      setForm({
        connection_id: mapping.connection_id || '',
        resource_type: mapping.resource_type || '',
        source_operation: mapping.source_operation || '',
        description: mapping.description || '',
        is_active: !!mapping.is_active,
        sample_params: '',
      });
      setRows(mapToRows(mapping.field_map));
    } else {
      setForm(emptyForm());
      setRows([]);
    }
  }, [open, mapping?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function mapToRows(fieldMap) {
    return Object.entries(fieldMap || {}).map(([canonical, path]) => ({ canonical, path: String(path ?? '') }));
  }

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  const selectedConn = connections.find((c) => c.id === form.connection_id) || null;
  const typeDef = catalog.find((t) => t.type === form.resource_type) || null;

  // Campos canônicos + de extensões, para o dropdown do editor.
  const canonicalFields = useMemo(() => {
    if (!typeDef) return [];
    const base = (typeDef.fields || []).map((f) => ({ key: f.key, label: f.label, group: 'Canônicos' }));
    const ext = (typeDef.extensions || []).flatMap((e) => (e.fields || []).map((f) => ({ key: f.key, label: f.label, group: `Extensão ${e.vertical}` })));
    return [...base, ...ext];
  }, [typeDef]);

  function addRow() { setRows((prev) => [...prev, { canonical: '', path: '' }]); }
  function removeRow(i) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }
  function patchRow(i, p) { setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r))); }

  async function handleSuggest() {
    if (!form.connection_id) { toast.error('Selecione a conexão para colher a amostra.'); return; }
    if (!form.resource_type) { toast.error('Selecione o tipo canônico.'); return; }
    if (!form.source_operation.trim()) { toast.error('Informe a operação de origem para amostrar.'); return; }
    let sampleParams;
    if (form.sample_params.trim()) {
      try { sampleParams = JSON.parse(form.sample_params); }
      catch { toast.error('Parâmetros de amostra: JSON inválido.'); return; }
    }
    setSuggesting(true);
    try {
      const res = await suggestMapping({
        connection_id: form.connection_id,
        resource_type: form.resource_type,
        source_operation: form.source_operation.trim(),
        sample_params: sampleParams,
      });
      const suggested = res?.suggested_field_map || {};
      setSampleKeys(Array.isArray(res?.sample_keys) ? res.sample_keys : []);
      // Preenche o editor com a sugestão para REVISÃO (não salva).
      setRows(Object.entries(suggested).map(([canonical, path]) => ({ canonical, path: String(path ?? '') })));
      const n = Object.keys(suggested).length;
      const strategy = res?.strategy === 'ai' ? 'IA' : 'heurística';
      toast.info(`${n} campo(s) sugerido(s) por ${strategy}. Revise antes de salvar.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSuggesting(false);
    }
  }

  function rowsToMap() {
    const out = {};
    for (const r of rows) {
      const c = (r.canonical || '').trim();
      const p = (r.path || '').trim();
      if (c && p) out[c] = p;
    }
    return out;
  }

  async function handleSave() {
    if (!isEdit && !form.connection_id) { toast.error('Selecione a conexão.'); return; }
    if (!isEdit && !form.resource_type) { toast.error('Selecione o tipo canônico.'); return; }
    if (!form.source_operation.trim()) { toast.error('Informe a operação de origem.'); return; }
    const fieldMap = rowsToMap();
    if (!Object.keys(fieldMap).length) { toast.error('Mapeie pelo menos um campo (canônico → caminho de origem).'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await updateMapping(mapping.id, {
          source_operation: form.source_operation.trim(),
          field_map: fieldMap,
          description: form.description.trim() || undefined,
          is_active: form.is_active,
        });
        toast.success('Mapeamento atualizado.');
      } else {
        const conn = connections.find((c) => c.id === form.connection_id);
        await createMapping({
          provider_key: conn?.provider_key,
          connection_id: form.connection_id,
          resource_type: form.resource_type,
          source_operation: form.source_operation.trim(),
          field_map: fieldMap,
          description: form.description.trim() || undefined,
          is_active: form.is_active,
          workspace_id: conn?.workspace_id || undefined,
          environment_id: conn?.environment_id || undefined,
        });
        toast.success('Mapeamento criado.');
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
      title={isEdit ? 'Editar mapeamento' : 'Novo mapeamento'}
      size="xl"
      dismissable={!saving}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Conexão (conector)" required hint={isEdit ? 'Não editável depois de criado.' : undefined}>
            <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })} disabled={isEdit}>
              <option value="">Selecione…</option>
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.provider_key}</option>)}
            </Select>
          </FormField>
          <FormField label="Tipo canônico" required hint={isEdit ? 'Não editável depois de criado.' : undefined}>
            <Select value={form.resource_type} onChange={(e) => patch({ resource_type: e.target.value })} disabled={isEdit}>
              <option value="">Selecione…</option>
              {catalog.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.type})</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="Operação de origem" required hint='Operação do conector que devolve a amostra (ex.: "cliente.dados").'>
          <TextInput value={form.source_operation} onChange={(e) => patch({ source_operation: e.target.value })} placeholder="cliente.dados" />
        </FormField>

        <FormField label="Descrição">
          <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </FormField>

        {/* Mapper Inteligente — sugere e preenche para revisão. */}
        <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>Sugerir mapeamento com IA</p>
            <button
              type="button"
              className="btn-secondary disabled:opacity-60"
              disabled={suggesting}
              onClick={handleSuggest}
            >
              {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-brand" />} Sugerir com IA
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>
            Colhe uma amostra da conexão e sugere o field_map. A sugestão apenas preenche o editor abaixo — revise e salve manualmente.
          </p>
          <FormField label="Parâmetros de amostra (JSON — opcional)">
            <Textarea rows={2} className="font-mono text-xs" value={form.sample_params} onChange={(e) => patch({ sample_params: e.target.value })} placeholder='{ "login": "teste" }' />
          </FormField>
        </div>

        {/* Editor do field_map: canonicalField → sourcePath */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>
              Mapeamento de campos <span style={{ color: 'var(--ap-text-5)' }}>(canônico → caminho na resposta)</span>
            </p>
            <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={addRow} disabled={!typeDef}>
              <Plus size={13} /> Campo
            </button>
          </div>
          {!typeDef ? (
            <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>Selecione o tipo canônico para listar os campos.</p>
          ) : !rows.length ? (
            <p className="text-[11px]" style={{ color: 'var(--ap-text-5)' }}>Nenhum campo mapeado. Use "Sugerir com IA" ou adicione manualmente.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <Select value={r.canonical} onChange={(e) => patchRow(i, { canonical: e.target.value })}>
                    <option value="">Campo canônico…</option>
                    {canonicalFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
                  </Select>
                  <TextInput
                    className="font-mono text-xs"
                    list={sampleKeys.length ? 'mapping-sample-keys' : undefined}
                    value={r.path}
                    onChange={(e) => patchRow(i, { path: e.target.value })}
                    placeholder="ex.: data.nome ou endereco.0.cidade"
                  />
                  <button type="button" className="btn-ghost p-1.5" title="Remover" onClick={() => removeRow(i)}>
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              ))}
              {sampleKeys.length > 0 && (
                <datalist id="mapping-sample-keys">
                  {sampleKeys.map((k) => <option key={k} value={k} />)}
                </datalist>
              )}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-current" />
          Ativar mapeamento (nasce inativo por padrão)
        </label>
      </div>
    </Modal>
  );
}
