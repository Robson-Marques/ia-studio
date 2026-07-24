import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { Badge, Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui/Table';
import { FormField, Select, TextInput, Textarea } from '../../components/ui/FormField';
import { useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { createTemplate, listNumbers, listTemplates, syncTemplates } from '../../services/whatsapp';
import { TEMPLATE_STATUS } from './whatsapp.constants';

const EMPTY_FORM = {
  name: '', category: 'UTILITY', language: 'pt_BR',
  header_text: '', body_text: '', footer_text: '', buttons: [],
};

// Templates HSM por conexão: lista com status Meta, criação com componentes
// básicos (header/body/footer/buttons) e sincronização bidirecional.
export default function Templates() {
  const toast = useToast();
  const { can } = usePermissions();
  const [numbers, setNumbers] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listNumbers()
      .then((n) => {
        setNumbers(n);
        if (n.length && !connectionId) setConnectionId(n[0].id);
      })
      .catch((err) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(conn = connectionId) {
    setLoading(true);
    try {
      setItems(await listTemplates(conn || undefined));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [connectionId]);

  async function handleSync() {
    if (!connectionId) { toast.error('Selecione uma conexão para sincronizar.'); return; }
    setSyncing(true);
    try {
      const r = await syncTemplates(connectionId);
      toast.success(`Sincronizado: ${r.pulled} template(s) da Meta, ${r.pushed} rascunho(s) publicados.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(false);
    }
  }

  function setField(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  function addButton() {
    if (form.buttons.length >= 3) { toast.error('Máximo de 3 botões.'); return; }
    setField('buttons', [...form.buttons, { type: 'QUICK_REPLY', text: '', url: '' }]);
  }

  function setButton(i, key, value) {
    setField('buttons', form.buttons.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)));
  }

  const varCount = useMemo(() => {
    const matches = form.body_text.match(/\{\{\d+\}\}/g) || [];
    return new Set(matches).size;
  }, [form.body_text]);
  const [examples, setExamples] = useState('');

  async function handleCreate() {
    if (!connectionId) { toast.error('Selecione a conexão do template.'); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) { toast.error('Nome do template: só minúsculas, números e underscore.'); return; }
    if (!form.body_text.trim()) { toast.error('O corpo (body) do template é obrigatório.'); return; }
    const bodyExamples = examples.split(',').map((s) => s.trim()).filter(Boolean);
    if (varCount > 0 && bodyExamples.length < varCount) {
      toast.error(`Informe ${varCount} exemplo(s) pras variáveis {{n}} do corpo (a Meta exige).`);
      return;
    }
    setSaving(true);
    try {
      await createTemplate({
        connection_id: connectionId,
        name: form.name,
        category: form.category,
        language: form.language,
        header_text: form.header_text || undefined,
        body_text: form.body_text,
        footer_text: form.footer_text || undefined,
        buttons: form.buttons.length
          ? form.buttons.map((b) => ({
              type: b.type, text: b.text,
              ...(b.type === 'URL' ? { url: b.url } : {}),
              ...(b.type === 'PHONE_NUMBER' ? { phone_number: b.url } : {}),
            }))
          : undefined,
        body_examples: bodyExamples.length ? bodyExamples : undefined,
      });
      toast.success('Template enviado pra análise da Meta.');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setExamples('');
      await load();
    } catch (err) {
      toast.error(err.message);
      await load(); // pode ter ficado como rascunho
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold flex-1" style={{ color: 'var(--ap-text-1)' }}>Templates WhatsApp</h2>
        <Select className="w-auto" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
          <option value="">Todas as conexões</option>
          {numbers.map((n) => (
            <option key={n.id} value={n.id}>{n.name}{n.phone ? ` — ${n.phone}` : ''}</option>
          ))}
        </Select>
        {can('comm.whatsapp.templates.manage') && (
          <>
            <button
              type="button"
              title="Puxa os templates da Meta e publica rascunhos locais (bidirecional)"
              className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
              disabled={syncing || !connectionId}
              onClick={handleSync}
            >
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar
            </button>
            <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> Novo template
            </button>
          </>
        )}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
        {loading ? (
          <div className="py-10 text-center"><Loader2 size={18} className="animate-spin inline" /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum template"
            description="Crie um template ou clique em Sincronizar pra puxar o catálogo aprovado na Meta."
          />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <Table>
                <Thead>
                  <Th>Nome</Th><Th>Idioma</Th><Th>Categoria</Th><Th>Status</Th><Th>Última sync</Th>
                </Thead>
                <Tbody>
                  {items.map((t) => {
                    const st = TEMPLATE_STATUS[t.status] || TEMPLATE_STATUS.PENDING;
                    return (
                      <Tr key={t.id}>
                        <Td>
                          <span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span>
                          {t.rejection_reason && <p className="text-[10px] text-red-400">{t.rejection_reason}</p>}
                        </Td>
                        <Td>{t.language}</Td>
                        <Td>{t.category}</Td>
                        <Td><Badge variant={st.variant}>{st.label}</Badge></Td>
                        <Td>{t.synced_at ? formatDateTime(t.synced_at) : '—'}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y" style={{ borderColor: 'var(--ap-border)' }}>
              {items.map((t) => {
                const st = TEMPLATE_STATUS[t.status] || TEMPLATE_STATUS.PENDING;
                return (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{t.name}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
                      {t.language} · {t.category}{t.synced_at ? ` · sync ${formatDateTime(t.synced_at)}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Criar template */}
      <Modal
        open={createOpen}
        onClose={saving ? undefined : () => setCreateOpen(false)}
        title="Novo template HSM"
        size="lg"
        dismissable={false}
        footer={
          <>
            <button className="btn-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Publicando…' : 'Criar e publicar na Meta'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <FormField label="Nome" required hint="minúsculas, números e _">
              <TextInput value={form.name} onChange={(e) => setField('name', e.target.value.toLowerCase())} placeholder="boas_vindas" />
            </FormField>
            <FormField label="Categoria" required>
              <Select value={form.category} onChange={(e) => setField('category', e.target.value)}>
                <option value="UTILITY">Utilidade</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Autenticação</option>
              </Select>
            </FormField>
            <FormField label="Idioma" required>
              <Select value={form.language} onChange={(e) => setField('language', e.target.value)}>
                <option value="pt_BR">Português (BR)</option>
                <option value="en_US">Inglês (US)</option>
                <option value="es">Espanhol</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Cabeçalho (opcional)">
            <TextInput value={form.header_text} onChange={(e) => setField('header_text', e.target.value)} maxLength={60} />
          </FormField>
          <FormField label="Corpo" required hint="Use {{1}}, {{2}}… pra variáveis.">
            <Textarea rows={4} value={form.body_text} onChange={(e) => setField('body_text', e.target.value)} maxLength={1024} />
          </FormField>
          {varCount > 0 && (
            <FormField label={`Exemplos das variáveis (${varCount})`} required hint="Separados por vírgula — a Meta exige exemplo pra cada {{n}}.">
              <TextInput value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="João, 25/12" />
            </FormField>
          )}
          <FormField label="Rodapé (opcional)">
            <TextInput value={form.footer_text} onChange={(e) => setField('footer_text', e.target.value)} maxLength={60} />
          </FormField>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>Botões (máx. 3)</span>
              <button type="button" className="btn-secondary !px-2 text-xs" onClick={addButton}>+ Botão</button>
            </div>
            {form.buttons.map((b, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select className="w-36" value={b.type} onChange={(e) => setButton(i, 'type', e.target.value)}>
                  <option value="QUICK_REPLY">Resposta rápida</option>
                  <option value="URL">Link</option>
                  <option value="PHONE_NUMBER">Telefone</option>
                </Select>
                <TextInput className="flex-1" placeholder="Texto do botão" value={b.text} maxLength={25}
                  onChange={(e) => setButton(i, 'text', e.target.value)} />
                {b.type !== 'QUICK_REPLY' && (
                  <TextInput className="flex-1" placeholder={b.type === 'URL' ? 'https://…' : '+55…'} value={b.url}
                    onChange={(e) => setButton(i, 'url', e.target.value)} />
                )}
                <button type="button" title="Remover botão" className="text-red-500"
                  onClick={() => setField('buttons', form.buttons.filter((_, idx) => idx !== i))}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>
            O template é publicado na WABA da conexão selecionada e entra em análise da Meta (status Em análise → Aprovado/Rejeitado).
          </p>
        </div>
      </Modal>
    </div>
  );
}
