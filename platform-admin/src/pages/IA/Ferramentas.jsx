import React, { useEffect, useState } from 'react';
import {
  Wrench, Loader2, Plus, Pencil, Server, RefreshCw, Search,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select } from '../../components/ui/FormField';
import {
  listTools, createTool, updateTool,
  listMcpServers, createMcpServer, syncMcpServer, getMcpServerTools,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { MCP_TRANSPORTS, formatDateTime } from './ia.constants';

const PAGE_TABS = [
  { id: 'catalog', label: 'Catálogo', Icon: Wrench },
  { id: 'mcp',     label: 'Servidores MCP', Icon: Server },
];

// Ferramentas: catálogo (builtin read-only + custom CRUD) + aba MCP Servers
// (cadastrar/sincronizar/descobrir tools).
export default function Ferramentas() {
  const [tab, setTab] = useState('catalog');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Ferramentas</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Capacidades que os agentes podem usar — builtin da plataforma, customizadas e descobertas por MCP.
        </p>
      </div>
      <Tabs items={PAGE_TABS} active={tab} onChange={setTab} />
      {tab === 'catalog' ? <CatalogTab /> : <McpTab />}
    </div>
  );
}

function CatalogTab() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const canWrite = can('ai.tools.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listTools();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--ap-text-4)' }}>
          Ferramentas builtin não podem ser editadas; crie ferramentas customizadas para operações de conexões.
        </p>
        {canWrite && <button className="btn-primary" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={14} /> Nova ferramenta</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Wrench} title="Nenhuma ferramenta" description="O catálogo builtin é carregado no provisionamento." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Nome</Th>
              <Th>Chave</Th>
              <Th>Categoria</Th>
              <Th>Origem</Th>
              <Th>Aprovação</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((t) => (
                <Tr key={t.id || t.key}>
                  <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span>
                    {t.description && <p className="text-[11px] truncate max-w-[280px]" style={{ color: 'var(--ap-text-4)' }}>{t.description}</p>}
                  </Td>
                  <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{t.key}</span></Td>
                  <Td>{t.category || '—'}</Td>
                  <Td>{t.builtin ? <Badge variant="blue">Builtin</Badge> : <Badge variant="purple">Custom</Badge>}</Td>
                  <Td>{t.requires_approval ? <Badge variant="yellow">Exige</Badge> : <span className="text-xs" style={{ color: 'var(--ap-text-5)' }}>não</span>}</Td>
                  <Td className="text-right">
                    {canWrite && !t.builtin && (
                      <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setEditing(t); setEditorOpen(true); }}>
                        <Pencil size={14} className="text-brand" />
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <ToolModal open={editorOpen} tool={editing} onClose={() => setEditorOpen(false)} onSaved={() => { setEditorOpen(false); load(); }} />
    </div>
  );
}

function ToolModal({ open, tool, onClose, onSaved }) {
  const isEdit = !!tool?.id;
  const [form, setForm] = useState({ key: '', name: '', description: '', category: '', input_schema: '{\n  "type": "object",\n  "properties": {}\n}', requires_approval: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(tool
      ? { key: tool.key || '', name: tool.name || '', description: tool.description || '', category: tool.category || '', input_schema: JSON.stringify(tool.input_schema || { type: 'object', properties: {} }, null, 2), requires_approval: !!tool.requires_approval }
      : { key: '', name: '', description: '', category: '', input_schema: '{\n  "type": "object",\n  "properties": {}\n}', requires_approval: false });
  }, [open, tool?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    if (!isEdit && !form.key.trim()) { toast.error('Informe a chave (key) única.'); return; }
    let schema;
    try { schema = JSON.parse(form.input_schema); } catch { toast.error('Input schema: JSON inválido.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        input_schema: schema,
        requires_approval: form.requires_approval,
      };
      if (isEdit) await updateTool(tool.id, body);
      else await createTool({ ...body, key: form.key.trim() });
      toast.success(isEdit ? 'Ferramenta atualizada.' : 'Ferramenta criada.');
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
      title={isEdit ? 'Editar ferramenta' : 'Nova ferramenta'}
      size="lg"
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
          <FormField label="Chave (key)" required hint="Única por organização. Não editável depois.">
            <TextInput value={form.key} onChange={(e) => patch({ key: e.target.value })} disabled={isEdit} placeholder="consultar_estoque" />
          </FormField>
          <FormField label="Nome" required>
            <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Consultar estoque" />
          </FormField>
        </div>
        <FormField label="Categoria">
          <TextInput value={form.category} onChange={(e) => patch({ category: e.target.value })} placeholder="dados / comunicação / documento…" />
        </FormField>
        <FormField label="Descrição" hint="Explica ao modelo quando usar a ferramenta.">
          <Textarea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
        </FormField>
        <FormField label="Input schema (JSON Schema)" required>
          <Textarea rows={7} className="font-mono text-xs" value={form.input_schema} onChange={(e) => patch({ input_schema: e.target.value })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.requires_approval} onChange={(e) => patch({ requires_approval: e.target.checked })} className="w-4 h-4 accent-current" />
          Exige aprovação antes de executar
        </label>
      </div>
    </Modal>
  );
}

function McpTab() {
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [toolsServer, setToolsServer] = useState(null);
  const [tools, setTools] = useState([]);

  const canWrite = can('ai.mcp.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listMcpServers({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync(server) {
    setSyncing(server.id);
    try {
      const res = await syncMcpServer(server.id);
      const count = res?.discovered_tools?.length ?? res?.tools?.length ?? res?.count;
      toast.success(count != null ? `Sincronizado — ${count} tools descobertas.` : 'Servidor sincronizado.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  }

  async function openTools(server) {
    try {
      const { items: list } = await getMcpServerTools(server.id);
      setTools(list);
      setToolsServer(server);
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs flex-1" style={{ color: 'var(--ap-text-4)' }}>
          Servidores MCP expõem ferramentas externas. Nascem inativos — ative e sincronize para descobrir as tools.
        </p>
        {canWrite && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Novo servidor</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card"><EmptyState icon={Server} title="Nenhum servidor MCP" description="Cadastre um servidor MCP para importar ferramentas externas." /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Nome</Th>
              <Th>Transporte</Th>
              <Th>Endpoint</Th>
              <Th>Status</Th>
              <Th>Última sync</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((s) => (
                <Tr key={s.id}>
                  <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{s.name}</span></Td>
                  <Td><Badge variant="gray">{s.transport}</Badge></Td>
                  <Td><span className="font-mono text-xs truncate max-w-[220px] block" style={{ color: 'var(--ap-text-3)' }}>{s.endpoint || '—'}</span></Td>
                  <Td>{s.is_active ? <Badge variant="green">Ativo</Badge> : <Badge variant="gray">Inativo</Badge>}</Td>
                  <Td>{formatDateTime(s.last_sync_at)}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button className="btn-ghost p-1.5" title="Ver tools descobertas" onClick={() => openTools(s)}><Search size={14} /></button>
                      {canWrite && (
                        <button className="btn-ghost p-1.5 disabled:opacity-40" title="Sincronizar / descobrir tools" disabled={syncing === s.id} onClick={() => handleSync(s)}>
                          {syncing === s.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} className="text-brand" />}
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <McpServerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onSaved={() => { setCreateOpen(false); load(); }}
      />

      <Modal open={!!toolsServer} onClose={() => setToolsServer(null)} title={`Tools de ${toolsServer?.name ?? ''}`} size="lg">
        {!tools.length ? (
          <EmptyState icon={Wrench} title="Nenhuma tool descoberta" description="Sincronize o servidor para descobrir as ferramentas." />
        ) : (
          <div className="space-y-1.5">
            {tools.map((t, i) => (
              <div key={t.name || i} className="rounded-lg p-2.5" style={{ border: '1px solid var(--ap-border)' }}>
                <p className="text-sm font-medium font-mono" style={{ color: 'var(--ap-text-1)' }}>{t.name}</p>
                {t.description && <p className="text-[11px] mt-0.5" style={{ color: 'var(--ap-text-4)' }}>{t.description}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function McpServerModal({ open, onClose, onSaved, workspaceId, environmentId }) {
  const [form, setForm] = useState({ name: '', transport: 'HTTP', endpoint: '', is_active: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', transport: 'HTTP', endpoint: '', is_active: false }); }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      await createMcpServer({
        name: form.name.trim(),
        transport: form.transport,
        endpoint: form.endpoint.trim() || undefined,
        is_active: form.is_active,
        workspace_id: workspaceId,
        environment_id: environmentId,
      });
      toast.success('Servidor MCP cadastrado.');
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
      title="Novo servidor MCP"
      size="md"
      dismissable={!saving}
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
        <FormField label="Nome" required>
          <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Ex.: MCP de documentos" />
        </FormField>
        <FormField label="Transporte">
          <Select value={form.transport} onChange={(e) => patch({ transport: e.target.value })}>
            {MCP_TRANSPORTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Endpoint" hint="URL (HTTP/SSE) ou comando (STDIO).">
          <TextInput value={form.endpoint} onChange={(e) => patch({ endpoint: e.target.value })} placeholder="https://mcp.exemplo.com" />
        </FormField>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ap-text-2)' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-current" />
          Ativar imediatamente (nasce inativo por padrão)
        </label>
      </div>
    </Modal>
  );
}
