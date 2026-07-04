import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput, Textarea, Select } from '../../components/ui/FormField';
import {
  listAutomationTemplates, createAutomationTemplate, updateAutomationTemplate, deleteAutomationTemplate,
} from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { toast } from '../../lib/toast';
import { CHANNEL_LABEL, formatDateTime } from './automation.constants';

// Catálogo de Templates (diretriz 11): conteúdo + {{variáveis}} por canal.
// A automação referencia o template e troca só o canal.
export default function TemplatesAutomacao() {
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listAutomationTemplates({
        channel: channel || undefined,
        environment_id: environmentId || undefined,
      });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [channel, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmDelete() {
    setDeletingBusy(true);
    try {
      await deleteAutomationTemplate(deleting.id);
      toast.success('Template excluído.');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingBusy(false);
    }
  }

  const canWrite = can('automation.templates.write');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Templates</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Catálogo multi-canal com {'{{variáveis}}'} — usados pelos nós Renderizar template e Notificação.
          </p>
        </div>
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="max-w-[160px]">
          <option value="">Todos os canais</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {canWrite && (
          <button className="btn-primary" onClick={() => setEditing({})}><Plus size={14} /> Novo template</button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="Nenhum template"
            description="Crie templates com {{variáveis}} pra reutilizar em fluxos e notificações."
            action={canWrite && <button className="btn-primary" onClick={() => setEditing({})}><Plus size={14} /> Novo template</button>}
          />
        </div>
      ) : (
        <>
          <div className="hidden md:block card p-0 overflow-hidden">
            <Table>
              <Thead>
                <Th>Nome</Th>
                <Th>Canal</Th>
                <Th>Variáveis</Th>
                <Th>Atualizado</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((t) => (
                  <Tr key={t.id} onClick={() => setEditing(t)}>
                    <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span></Td>
                    <Td><Badge variant="purple">{CHANNEL_LABEL[t.channel] || t.channel}</Badge></Td>
                    <Td>
                      <div className="flex gap-1 flex-wrap">
                        {extractVars(t).slice(0, 4).map((v) => <Badge key={v} variant="gray">{v}</Badge>)}
                        {extractVars(t).length > 4 && <Badge variant="gray">+{extractVars(t).length - 4}</Badge>}
                      </div>
                    </Td>
                    <Td>{formatDateTime(t.updated_at)}</Td>
                    <Td className="text-right">
                      {canWrite && (
                        <>
                          <button className="btn-ghost p-1.5" title="Editar" onClick={(ev) => { ev.stopPropagation(); setEditing(t); }}>
                            <Pencil size={14} className="text-brand" />
                          </button>
                          <button className="btn-ghost p-1.5" title="Excluir" onClick={(ev) => { ev.stopPropagation(); setDeleting(t); }}>
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
          <div className="md:hidden space-y-2">
            {items.map((t) => (
              <button key={t.id} className="card w-full text-left" onClick={() => setEditing(t)}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span>
                  <Badge variant="purple">{CHANNEL_LABEL[t.channel] || t.channel}</Badge>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <TemplateModal
        template={editing}
        canWrite={canWrite}
        workspaceId={workspaceId}
        environmentId={environmentId}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
      <ConfirmDialog
        open={!!deleting}
        danger
        loading={deletingBusy}
        title="Excluir template"
        message={`Excluir "${deleting?.name}"? Fluxos que o referenciam passam a falhar no passo de render/notificação.`}
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function extractVars(t) {
  const out = new Set();
  const re = /\{\{\s*([\w.[\]-]+)\s*\}\}/g;
  let m;
  const text = `${t.subject ?? ''} ${t.body ?? ''}`;
  while ((m = re.exec(text)) !== null) out.add(m[1]);
  return [...out];
}

function TemplateModal({ template, canWrite, workspaceId, environmentId, onClose, onSaved }) {
  const isEdit = Boolean(template?.id);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('WHATSAPP');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name || '');
    setChannel(template.channel || 'WHATSAPP');
    setSubject(template.subject || '');
    setBody(template.body || '');
  }, [template]);

  const variables = useMemo(() => extractVars({ subject, body }), [subject, body]);

  if (!template) return null;

  async function handleSave() {
    if (!name.trim()) { toast.error('Informe o nome do template.'); return; }
    if (!body.trim()) { toast.error('Informe o conteúdo.'); return; }
    if (!isEdit && (!workspaceId || !environmentId)) { toast.error('Selecione um workspace e um ambiente no topo.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await updateAutomationTemplate(template.id, { name: name.trim(), subject: subject.trim() || undefined, body });
      } else {
        await createAutomationTemplate({
          name: name.trim(),
          channel,
          subject: subject.trim() || undefined,
          body,
          workspace_id: workspaceId,
          environment_id: environmentId,
        });
      }
      toast.success(isEdit ? 'Template atualizado.' : 'Template criado.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={isEdit ? 'Editar template' : 'Novo template'}
      size="lg"
      dismissable={!saving}
      footer={
        canWrite ? (
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {isEdit && (
          <p className="text-xs rounded-lg p-2" style={{ border: '1px solid var(--ap-border)', color: 'var(--ap-text-3)' }}>
            O canal não muda após a criação — crie outro template pra outro canal.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="Nome" required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField label="Canal" required>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={isEdit || !canWrite}>
              {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </FormField>
        </div>
        <FormField label="Assunto" hint="Usado em e-mail/notificação (opcional).">
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Conteúdo" required hint="Use {{variáveis}} — ex.: {{input.name}}, {{vars.passo_1.status}}.">
          <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canWrite} />
        </FormField>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>Variáveis detectadas</p>
          <div className="flex gap-1 flex-wrap">
            {variables.length ? variables.map((v) => <Badge key={v} variant="blue">{`{{${v}}}`}</Badge>) : (
              <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>nenhuma</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
