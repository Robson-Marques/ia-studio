import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Loader2, Plus, Upload, Archive } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea } from '../../components/ui/FormField';
import { listWorkflows, createWorkflow, importWorkflow, archiveWorkflow } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { WORKFLOW_STATUS, EXECUTION_STATUS, formatDateTime } from './automation.constants';

// Fluxos de automação: lista (nome, status, versão, tags, últimas execuções)
// + criar + importar (JSON diretriz 29) + arquivar. Editor em rota própria.
export default function Fluxos() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const [archLoading, setArchLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listWorkflows({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]);

  async function confirmArchive() {
    setArchLoading(true);
    try {
      await archiveWorkflow(archiving.id);
      toast.success('Fluxo arquivado.');
      setArchiving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setArchLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Fluxos</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Automações com versões imutáveis — editar cria versão nova; publicar aponta a ativa.
          </p>
        </div>
        {can('automation.workflows.write') && (
          <>
            <button className="btn-secondary" onClick={() => setImportOpen(true)} title="Importar fluxo de um JSON exportado">
              <Upload size={14} /> Importar
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> Novo fluxo
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={GitBranch}
            title="Nenhum fluxo neste ambiente"
            description="Crie um fluxo e monte os passos no editor."
            action={can('automation.workflows.write') && (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Novo fluxo</button>
            )}
          />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Nome</Th>
                <Th>Status</Th>
                <Th>Versão ativa</Th>
                <Th>Tags</Th>
                <Th>Últimas execuções</Th>
                <Th>Atualizado</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((w) => (
                  <Tr key={w.id} onClick={() => navigate(`/automacao/fluxos/${w.id}`)}>
                    <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{w.name}</span></Td>
                    <Td><StatusBadge status={w.status} /></Td>
                    <Td>{w.current_version > 0 ? `v${w.current_version}` : '—'}</Td>
                    <Td>
                      <div className="flex gap-1 flex-wrap">
                        {(w.tags || []).map((t) => <Badge key={t} variant="gray">{t}</Badge>)}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        {(w.recent_executions || []).map((e) => {
                          const info = EXECUTION_STATUS[e.status] || { label: e.status, variant: 'gray' };
                          return <Badge key={e.id} variant={info.variant}>{info.label}</Badge>;
                        })}
                        {!(w.recent_executions || []).length && <span className="text-xs" style={{ color: 'var(--ap-text-5)' }}>nenhuma</span>}
                      </div>
                    </Td>
                    <Td>{formatDateTime(w.updated_at)}</Td>
                    <Td className="text-right">
                      {can('automation.workflows.write') && w.status !== 'ARCHIVED' && (
                        <button
                          className="btn-ghost p-1.5"
                          title="Arquivar: para gatilhos e tira das listas ativas (não exclui)"
                          onClick={(ev) => { ev.stopPropagation(); setArchiving(w); }}
                        >
                          <Archive size={14} className="text-red-500" />
                        </button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden space-y-2">
            {items.map((w) => (
              <button
                key={w.id}
                className="card w-full text-left"
                onClick={() => navigate(`/automacao/fluxos/${w.id}`)}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{w.name}</span>
                  <StatusBadge status={w.status} />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--ap-text-4)' }}>
                  {w.current_version > 0 ? `v${w.current_version} · ` : ''}{formatDateTime(w.updated_at)}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      <CreateWorkflowModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(w) => { setCreateOpen(false); navigate(`/automacao/fluxos/${w.id}`); }}
        workspaceId={workspaceId}
        environmentId={environmentId}
      />
      <ImportWorkflowModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(w) => { setImportOpen(false); toast.success('Fluxo importado.'); navigate(`/automacao/fluxos/${w.id}`); }}
        workspaceId={workspaceId}
        environmentId={environmentId}
      />
      <ConfirmDialog
        open={!!archiving}
        danger
        loading={archLoading}
        title="Arquivar fluxo"
        message={`Arquivar "${archiving?.name}"? Gatilhos (evento/agendamento/webhook) param de disparar. O histórico de versões e execuções é mantido — nada é excluído.`}
        confirmLabel="Arquivar"
        onClose={() => setArchiving(null)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}

export function StatusBadge({ status }) {
  const info = WORKFLOW_STATUS[status] || { label: status, variant: 'gray' };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function CreateWorkflowModal({ open, onClose, onCreated, workspaceId, environmentId }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setDescription(''); setTags(''); } }, [open]);

  async function handleSave() {
    if (!name.trim()) { toast.error('Informe o nome do fluxo.'); return; }
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      const workflow = await createWorkflow({
        name: name.trim(),
        description: description.trim() || undefined,
        workspace_id: workspaceId,
        environment_id: environmentId,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      toast.success('Fluxo criado — monte os passos no editor.');
      onCreated(workflow);
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
      title="Novo fluxo"
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
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Boas-vindas WhatsApp" />
        </FormField>
        <FormField label="Descrição">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </FormField>
        <FormField label="Tags" hint="Separadas por vírgula.">
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="onboarding, whatsapp" />
        </FormField>
      </div>
    </Modal>
  );
}

function ImportWorkflowModal({ open, onClose, onImported, workspaceId, environmentId }) {
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setJson(''); }, [open]);

  async function handleImport() {
    if (!workspaceId || !environmentId) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      toast.error('JSON inválido — cole o conteúdo exportado do fluxo.');
      return;
    }
    setSaving(true);
    try {
      const workflow = await importWorkflow({ workspace_id: workspaceId, environment_id: environmentId, data });
      onImported(workflow);
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
      title="Importar fluxo"
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
      <FormField label="JSON exportado" required hint="Exportado pela ação Exportar de um fluxo (sem segredos — diretriz 29).">
        <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={12} className="font-mono text-xs" placeholder='{"schema_version":1,"kind":"iastudio.workflow",...}' />
      </FormField>
    </Modal>
  );
}
