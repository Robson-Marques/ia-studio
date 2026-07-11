import React, { useEffect, useState } from 'react';
import {
  BookOpen, Loader2, Plus, Trash2, ArrowLeft, FileText, Search, RefreshCw,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../components/ui/FormField';
import {
  listKnowledgeBases, getKnowledgeBase, createKnowledgeBase, updateKnowledgeBase,
  deleteKnowledgeBase, addKnowledgeDocument, queryKnowledgeBase,
} from '../../services/ai';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { DOC_STATUS, formatDateTime } from './ia.constants';

// Bases de conhecimento (RAG): lista + detalhe com documentos (upload texto/URL),
// status de ingestão e "Testar consulta" (query → chunks + score).
export default function BasesConhecimento() {
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const canWrite = can('ai.knowledge.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listKnowledgeBases({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmRemove() {
    setRemoveLoading(true);
    try {
      await deleteKnowledgeBase(removing.id);
      toast.success('Base excluída.');
      setRemoving(null);
      if (selected?.id === removing.id) setSelected(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoveLoading(false);
    }
  }

  if (selected) {
    return <BaseDetail baseId={selected.id} onBack={() => { setSelected(null); load(); }} canWrite={canWrite} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Conhecimento</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Fontes para RAG — documentos são divididos em chunks e indexados por embeddings.
          </p>
        </div>
        {canWrite && (
          <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Nova base</button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={BookOpen}
            title="Nenhuma base neste ambiente"
            description="Crie uma base e adicione documentos para consulta pelos assistentes."
            action={canWrite && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Nova base</button>}
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Nome</Th>
                <Th>Modelo de embedding</Th>
                <Th>Documentos</Th>
                <Th>Atualizado</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((b) => (
                  <Tr key={b.id} onClick={() => setSelected(b)}>
                    <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{b.name}</span></Td>
                    <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{b.embedding_model}</span></Td>
                    <Td>{b.document_count ?? b.documents?.length ?? 0}</Td>
                    <Td>{formatDateTime(b.updated_at)}</Td>
                    <Td className="text-right">
                      {canWrite && (
                        <button className="btn-ghost p-1.5" title="Excluir base" onClick={(ev) => { ev.stopPropagation(); setRemoving(b); }}>
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="md:hidden space-y-2">
            {items.map((b) => (
              <button key={b.id} className="card w-full text-left" onClick={() => setSelected(b)}>
                <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{b.name}</span>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{b.document_count ?? 0} docs · {b.embedding_model}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <CreateBaseModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onCreated={(b) => { setCreateOpen(false); load(); setSelected(b); }}
      />
      <ConfirmDialog
        open={!!removing}
        danger
        loading={removeLoading}
        title="Excluir base de conhecimento"
        message={`Excluir "${removing?.name}"? Documentos e chunks indexados são removidos. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function BaseDetail({ baseId, onBack, canWrite }) {
  const [base, setBase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docOpen, setDocOpen] = useState(false);
  const [queryOpen, setQueryOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setBase(await getKnowledgeBase(baseId));
    } catch (err) {
      toast.error(err.message);
      onBack();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [baseId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !base) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>;
  }

  const docs = base.documents || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost p-2" onClick={onBack} aria-label="Voltar"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--ap-text-1)' }}>{base.name}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            {base.embedding_model} · chunk {base.chunk_size}/{base.chunk_overlap} · {docs.length} documentos
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setQueryOpen(true)}><Search size={14} /> Testar consulta</button>
        {canWrite && <button className="btn-primary" onClick={() => setDocOpen(true)}><Plus size={14} /> Adicionar documento</button>}
      </div>

      <div className="card p-0 overflow-hidden">
        {!docs.length ? (
          <EmptyState icon={FileText} title="Sem documentos" description="Adicione texto ou uma URL para indexar." />
        ) : (
          <Table>
            <Thead>
              <Th>Fonte</Th>
              <Th>Tipo</Th>
              <Th>Status</Th>
              <Th>Chunks</Th>
              <Th>Criado</Th>
            </Thead>
            <Tbody>
              {docs.map((d) => {
                const st = DOC_STATUS[d.status] || { label: d.status, variant: 'gray' };
                return (
                  <Tr key={d.id}>
                    <Td><span className="truncate max-w-[320px] block" style={{ color: 'var(--ap-text-1)' }}>{d.source_ref || d.id}</span></Td>
                    <Td><Badge variant="gray">{d.source_type}</Badge></Td>
                    <Td><Badge variant={st.variant}>{st.label}</Badge>{d.error && <p className="text-[10px] text-red-500 mt-0.5">{d.error}</p>}</Td>
                    <Td>{d.chunk_count ?? 0}</Td>
                    <Td>{formatDateTime(d.created_at)}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </div>

      <AddDocumentModal open={docOpen} onClose={() => setDocOpen(false)} baseId={baseId} onAdded={() => { setDocOpen(false); load(); }} />
      <QueryModal open={queryOpen} onClose={() => setQueryOpen(false)} baseId={baseId} />
    </div>
  );
}

function CreateBaseModal({ open, onClose, onCreated, workspaceId, environmentId }) {
  const [form, setForm] = useState({ name: '', description: '', embedding_connection_id: '', embedding_model: 'text-embedding-3-small', chunk_size: 800, chunk_overlap: 120 });
  const [connections, setConnections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ name: '', description: '', embedding_connection_id: '', embedding_model: 'text-embedding-3-small', chunk_size: 800, chunk_overlap: 120 });
    listConnections({ category: 'AI' }).then((r) => setConnections(r.items)).catch(() => setConnections([]));
  }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome da base.'); return; }
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      const base = await createKnowledgeBase({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        workspace_id: workspaceId,
        environment_id: environmentId,
        embedding_connection_id: form.embedding_connection_id || null,
        embedding_model: form.embedding_model.trim() || 'text-embedding-3-small',
        chunk_size: form.chunk_size,
        chunk_overlap: form.chunk_overlap,
      });
      toast.success('Base criada.');
      onCreated(base);
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
      title="Nova base de conhecimento"
      size="md"
      dismissable={!saving}
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
          <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: FAQ de suporte" />
        </FormField>
        <FormField label="Descrição">
          <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </FormField>
        <FormField label="Conexão de embeddings" hint="Connection AI. Vazio = orquestrador.">
          <Select value={form.embedding_connection_id} onChange={(e) => patch({ embedding_connection_id: e.target.value })}>
            <option value="">— orquestrador (automático) —</option>
            {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
          </Select>
        </FormField>
        <FormField label="Modelo de embedding">
          <TextInput value={form.embedding_model} onChange={(e) => patch({ embedding_model: e.target.value })} placeholder="text-embedding-3-small" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tamanho do chunk">
            <NumberInput value={form.chunk_size} onChange={(v) => patch({ chunk_size: v })} min={100} step={50} />
          </FormField>
          <FormField label="Overlap">
            <NumberInput value={form.chunk_overlap} onChange={(v) => patch({ chunk_overlap: v })} min={0} step={10} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

function AddDocumentModal({ open, onClose, baseId, onAdded }) {
  const [mode, setMode] = useState('TXT'); // TXT | MARKDOWN | URL
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setMode('TXT'); setText(''); setUrl(''); setRef(''); } }, [open]);
  useEffect(() => { setText(''); setUrl(''); setRef(''); }, [mode]);

  const isTextMode = mode === 'TXT' || mode === 'MARKDOWN';

  async function handleSave() {
    let body;
    if (mode === 'URL') {
      if (!url.trim()) { toast.error('Informe a URL.'); return; }
      body = { source_type: 'URL', source_ref: url.trim() };
    } else {
      if (!text.trim()) { toast.error('Cole o texto do documento.'); return; }
      body = { source_type: mode, source_ref: ref.trim() || (mode === 'MARKDOWN' ? 'Markdown colado' : 'Texto colado'), text: text.trim() };
    }
    setSaving(true);
    try {
      await addKnowledgeDocument(baseId, body);
      toast.success('Documento adicionado — ingestão em processamento.');
      onAdded();
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
      title="Adicionar documento"
      size="lg"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Adicionar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Origem">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="TXT">Texto colado</option>
            <option value="MARKDOWN">Markdown</option>
            <option value="URL">URL (página web)</option>
          </Select>
        </FormField>
        {mode === 'URL' ? (
          <FormField label="URL" required hint="A plataforma busca e extrai o texto da página.">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com/faq" />
          </FormField>
        ) : (
          <>
            <FormField label="Identificação" hint="Nome que aparece na lista.">
              <TextInput value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex.: Política de trocas" />
            </FormField>
            <FormField label={isTextMode && mode === 'MARKDOWN' ? 'Conteúdo Markdown' : 'Texto'} required hint={mode === 'MARKDOWN' ? 'Aceita sintaxe Markdown (títulos, listas, etc.).' : undefined}>
              <Textarea rows={8} className={mode === 'MARKDOWN' ? 'font-mono text-xs' : ''} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'MARKDOWN' ? '# Título\n\n- item…' : 'Cole aqui o conteúdo…'} />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}

function QueryModal({ open, onClose, baseId }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(4);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setQuery(''); setTopK(4); setResult(null); } }, [open]);

  async function handleQuery() {
    if (!query.trim()) { toast.error('Informe a consulta.'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await queryKnowledgeBase(baseId, { query: query.trim(), top_k: topK });
      setResult(res);
      const chunks = res?.chunks || res?.results || res?.items || [];
      if (!chunks.length) toast.info('Nenhum chunk relevante encontrado.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const chunks = result?.chunks || result?.results || result?.items || [];

  return (
    <Modal
      open={open}
      onClose={running ? undefined : onClose}
      title="Testar consulta (RAG)"
      size="lg"
      dismissable={!running}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={running}>Fechar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleQuery} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Consultar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <FormField label="Consulta" className="flex-1">
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: qual o prazo de entrega?" />
          </FormField>
          <FormField label="Top K" className="w-24">
            <NumberInput value={topK} onChange={(v) => setTopK(v)} min={1} max={20} step={1} />
          </FormField>
        </div>
        {chunks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>Trechos recuperados</p>
            {chunks.map((c, i) => (
              <div key={c.id || i} className="rounded-lg p-2.5" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="blue">score {Number(c.score ?? c.similarity ?? 0).toFixed(3)}</Badge>
                  <span className="text-[10px]" style={{ color: 'var(--ap-text-5)' }}>chunk #{c.idx ?? i}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap break-words" style={{ color: 'var(--ap-text-3)' }}>{c.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
