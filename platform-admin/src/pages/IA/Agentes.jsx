import React, { useEffect, useState } from 'react';
import { Bot, Loader2, Plus, Upload, Download, History, Play, Pencil } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, Textarea } from '../../components/ui/FormField';
import {
  listAgents, getAgent, listAgentVersions, exportAgent, importAgent,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useToast } from '@studio-ux-ds/react';
import { formatDateTime } from './ia.constants';
import AgentEditorModal from './editor/AgentEditorModal';
import AgentVersionsModal from './editor/AgentVersionsModal';
import AgentExecuteModal from './editor/AgentExecuteModal';

// Agentes de IA: lista + editor multi-aba (Geral/Persona/Prompt/Ferramentas/
// Conhecimento/Memória/Aprovações/Custos). Ações: Publicar/Rollback (versões),
// Testar (execução com transcript+tokens+custo), Exportar/Importar (sem secrets).
export default function Agentes() {
  const toast = useToast();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // agent | null (novo)
  const [importOpen, setImportOpen] = useState(false);

  const [versionsAgent, setVersionsAgent] = useState(null);
  const [versions, setVersions] = useState([]);
  const [executeAgent_, setExecuteAgent_] = useState(null);

  const canWrite = can('ai.agents.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listAgents({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openEditor(agent) {
    if (agent?.id) {
      try {
        const full = await getAgent(agent.id);
        setEditing(full);
      } catch (err) { toast.error(err.message); return; }
    } else {
      setEditing(null);
    }
    setEditorOpen(true);
  }

  async function openVersions(agent) {
    try {
      const { items: vs } = await listAgentVersions(agent.id);
      setVersions(vs);
      setVersionsAgent(agent);
    } catch (err) { toast.error(err.message); }
  }

  async function handleExport(agent) {
    try {
      const data = await exportAgent(agent.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agente-${(agent.name || 'export').toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Assistente exportado (sem segredos).');
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Assistentes</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Quem atende: personalidade, o que faz, o que sabe e o que pode fazer. Cada mudança vira uma versão.
          </p>
        </div>
        {canWrite && (
          <>
            <button className="btn-secondary" onClick={() => setImportOpen(true)} title="Importar assistente de um arquivo exportado">
              <Upload size={14} /> Importar
            </button>
            <button className="btn-primary" onClick={() => openEditor(null)}>
              <Plus size={14} /> Novo assistente
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={Bot}
            title="Nenhum assistente neste ambiente"
            description="Crie um assistente e configure quem ele é, o que faz e o que pode fazer."
            action={canWrite && <button className="btn-primary" onClick={() => openEditor(null)}><Plus size={14} /> Novo assistente</button>}
          />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Nome</Th>
                <Th>Modelo</Th>
                <Th>Versão ativa</Th>
                <Th>Status</Th>
                <Th>Atualizado</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <button className="font-medium text-left" style={{ color: 'var(--ap-text-1)' }} onClick={() => openEditor(a)}>{a.name}</button>
                      {a.description && <p className="text-[11px] truncate max-w-[280px]" style={{ color: 'var(--ap-text-4)' }}>{a.description}</p>}
                    </Td>
                    <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{a.model}</span></Td>
                    <Td>{a.current_version > 0 ? `v${a.current_version}` : '—'}</Td>
                    <Td>{a.is_active === false ? <Badge variant="gray">Inativo</Badge> : <Badge variant="green">Ativo</Badge>}</Td>
                    <Td>{formatDateTime(a.updated_at)}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        {can('ai.agents.execute') && (
                          <button className="btn-ghost p-1.5" title="Testar o assistente" onClick={() => setExecuteAgent_(a)}>
                            <Play size={14} className="text-brand" />
                          </button>
                        )}
                        <button className="btn-ghost p-1.5" title="Versões — publicar/rollback" onClick={() => openVersions(a)}>
                          <History size={14} />
                        </button>
                        <button className="btn-ghost p-1.5" title="Exportar (sem segredos)" onClick={() => handleExport(a)}>
                          <Download size={14} />
                        </button>
                        {canWrite && (
                          <button className="btn-ghost p-1.5" title="Editar" onClick={() => openEditor(a)}>
                            <Pencil size={14} className="text-brand" />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden space-y-2">
            {items.map((a) => (
              <div key={a.id} className="card">
                <button className="w-full text-left" onClick={() => openEditor(a)}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{a.name}</span>
                    {a.current_version > 0 && <span className="text-xs font-mono" style={{ color: 'var(--ap-text-4)' }}>v{a.current_version}</span>}
                  </div>
                  <p className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--ap-text-4)' }}>{a.model}</p>
                </button>
                <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: '1px solid var(--ap-border)' }}>
                  {can('ai.agents.execute') && (
                    <button className="btn-secondary text-xs flex-1" onClick={() => setExecuteAgent_(a)}><Play size={13} /> Testar</button>
                  )}
                  <button className="btn-secondary text-xs flex-1" onClick={() => openVersions(a)}><History size={13} /> Versões</button>
                  {canWrite && (
                    <button className="btn-secondary text-xs flex-1" onClick={() => openEditor(a)}><Pencil size={13} /> Editar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AgentEditorModal
        open={editorOpen}
        agent={editing}
        canWrite={canWrite}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />

      <ImportAgentModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onImported={() => { setImportOpen(false); toast.success('Assistente importado.'); load(); }}
      />

      <AgentVersionsModal
        open={!!versionsAgent}
        agent={versionsAgent}
        versions={versions}
        onClose={() => setVersionsAgent(null)}
        onPublished={() => { setVersionsAgent(null); load(); }}
      />

      {executeAgent_ && (
        <AgentExecuteModal open={!!executeAgent_} agent={executeAgent_} onClose={() => setExecuteAgent_(null)} />
      )}
    </div>
  );
}

function ImportAgentModal({ open, onClose, onImported, workspaceId, environmentId }) {
  const toast = useToast();
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setJson(''); }, [open]);

  async function handleImport() {
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    let data;
    try { data = JSON.parse(json); } catch { toast.error('Arquivo inválido — cole o conteúdo exportado do assistente.'); return; }
    setSaving(true);
    try {
      await importAgent({ workspace_id: workspaceId, environment_id: environmentId, data });
      onImported();
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
      title="Importar assistente"
      size="lg"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleImport} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Importar
          </button>
        </>
      }
    >
      <FormField label="Conteúdo exportado" required hint="Gerado pela ação Exportar de um assistente (sem segredos).">

        <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={12} className="font-mono text-xs" placeholder='{"schema_version":1,"kind":"iastudio.agent",...}' />
      </FormField>
    </Modal>
  );
}
