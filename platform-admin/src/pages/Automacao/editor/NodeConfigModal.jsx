import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { FormField, TextInput, Textarea, Select, NumberInput } from '../../../components/ui/FormField';
import { listConnections } from '../../../services/integrations';
import { listAutomationTemplates } from '../../../services/automation';
import { useToast } from '@studio-ux-ds/react';

// Modal DECLARATIVO de configuração de nó: renderiza os campos da definition
// vinda do catálogo (text/textarea/number/select/json/connection/template) —
// nenhum código por tipo de nó. Aceita {{variáveis}} nos campos de texto.
export default function NodeConfigModal({ open, node, definition, onClose, onSave }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [config, setConfig] = useState({});
  const [jsonDrafts, setJsonDrafts] = useState({});
  const [connections, setConnections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  const fields = definition?.fields || [];

  useEffect(() => {
    if (!open || !node) return;
    setName(node.name || definition?.label || '');
    setConfig({ ...(node.config || {}) });
    const drafts = {};
    for (const f of fields.filter((x) => x.type === 'json')) {
      const v = (node.config || {})[f.key];
      drafts[f.key] = v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
    }
    setJsonDrafts(drafts);
    // Referências (conexões/templates) só quando a definition precisa.
    const needsConn = fields.some((f) => f.type === 'connection');
    const needsTpl = fields.some((f) => f.type === 'template');
    if (needsConn || needsTpl) {
      setLoadingRefs(true);
      Promise.all([
        needsConn ? listConnections().then((r) => r.items).catch(() => []) : Promise.resolve([]),
        needsTpl ? listAutomationTemplates().then((r) => r.items).catch(() => []) : Promise.resolve([]),
      ])
        .then(([conns, tpls]) => { setConnections(conns); setTemplates(tpls); })
        .finally(() => setLoadingRefs(false));
    }
  }, [open, node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !node || !definition) return null;

  function setValue(key, value) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const merged = { ...config };
    for (const f of fields.filter((x) => x.type === 'json')) {
      const raw = (jsonDrafts[f.key] ?? '').trim();
      if (!raw) { delete merged[f.key]; continue; }
      try {
        merged[f.key] = JSON.parse(raw);
      } catch {
        toast.error(`Campo "${f.label}": JSON inválido.`);
        return;
      }
    }
    for (const f of fields) {
      if (f.required && !String(merged[f.key] ?? '').trim() && f.type !== 'json') {
        toast.error(`Preencha o campo "${f.label}".`);
        return;
      }
    }
    onSave({ ...node, name: name.trim() || definition.label, config: merged });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Configurar: ${definition.label}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Aplicar</button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
          {definition.description} Use {'{{ }}'} para inserir dados — ex.: o telefone do contato ({'{{input.phone}}'}) ou o resultado de um passo anterior.
        </p>
        <FormField label="Nome do passo">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={definition.label} />
        </FormField>
        {loadingRefs && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin" /></div>}
        {fields.map((f) => (
          <FormField key={f.key} label={f.label} required={f.required} hint={f.help}>
            {f.type === 'textarea' && (
              <Textarea rows={3} value={config[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
            {f.type === 'number' && (
              <NumberInput value={config[f.key] ?? f.default ?? 0} onChange={(v) => setValue(f.key, v)} allowEmpty={false} />
            )}
            {f.type === 'select' && (
              <Select value={config[f.key] ?? f.default ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
            {f.type === 'json' && (
              <Textarea
                rows={4}
                className="font-mono text-xs"
                value={jsonDrafts[f.key] ?? ''}
                onChange={(e) => setJsonDrafts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder='{ "chave": "valor" }'
              />
            )}
            {f.type === 'connection' && (
              <Select value={config[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                <option value="">— nenhuma —</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
              </Select>
            )}
            {f.type === 'template' && (
              <Select value={config[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                <option value="">— nenhum —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
              </Select>
            )}
            {(f.type === 'text' || !['textarea', 'number', 'select', 'json', 'connection', 'template'].includes(f.type)) && (
              <TextInput value={config[f.key] ?? f.default ?? ''} onChange={(e) => setValue(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
          </FormField>
        ))}
      </div>
    </Modal>
  );
}
