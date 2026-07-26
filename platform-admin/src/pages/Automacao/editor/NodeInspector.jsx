import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Drawer, Field, Input, TextArea, Select, NumericInput, Button, useToast,
} from '@studio-ux-ds/react';
import { listConnections } from '../../../services/integrations';
import { listAutomationTemplates } from '../../../services/automation';

// Automação/editor/NodeInspector — configuração de UM passo do fluxo (v0.10.2).
//
// Era `NodeConfigModal` (Modal `size="lg"`) e virou **inspetor** — o `Drawer`
// lateral do DS. O porquê, que é decisão registrada no DS v1.2.24:
//
//  · o passo tem TextArea e campos JSON, então **não pode ser Modal** (regra do
//    DS, mecânica, sem exceção);
//  · e também **não pode ser rota**: o passo é rascunho da sessão de edição — só
//    existe no servidor quando você salva uma versão do fluxo. Uma URL própria
//    exigiria persistir rascunho, o que muda o modelo de edição;
//  · o inspetor resolve os dois: painel lateral, com o fluxo continuando à vista
//    atrás (o passo anterior, o seguinte, a ordem) — que é justamente o contexto
//    de que se precisa pra configurar um passo. `width={520}` porque JSON em
//    360px quebra em toda linha.
//
// O corpo segue DECLARATIVO: renderiza os campos que vêm da definition do
// catálogo (text/textarea/number/select/json/connection/template). Nenhum código
// por tipo de nó — nó novo no backend aparece aqui sozinho.

export default function NodeInspector({ open, node, definition, onClose, onSave }) {
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

  function handleApply() {
    const merged = { ...config };
    for (const f of fields.filter((x) => x.type === 'json')) {
      const raw = (jsonDrafts[f.key] ?? '').trim();
      if (!raw) { delete merged[f.key]; continue; }
      try {
        merged[f.key] = JSON.parse(raw);
      } catch {
        toast.error(`O campo "${f.label}" não está num JSON válido.`);
        return;
      }
    }
    for (const f of fields) {
      if (f.required && !String(merged[f.key] ?? '').trim() && f.type !== 'json') {
        toast.error(`Preencha "${f.label}".`);
        return;
      }
    }
    onSave({ ...node, name: name.trim() || definition.label, config: merged });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={definition.label}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleApply}>Aplicar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>
          {definition.description}
        </p>
        <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>
          Nos campos de texto você pode inserir dados do fluxo entre chaves duplas —
          por exemplo o telefone que chegou no gatilho ({'{{input.phone}}'}) ou o
          resultado de um passo anterior ({'{{vars.passo_1.status}}'}).
        </p>

        <Field label="Nome do passo" hint="Só para você reconhecer o passo na lista.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={definition.label} />
        </Field>

        {loadingRefs && (
          <div className="flex justify-center py-2">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
          </div>
        )}

        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.help}>
            {f.type === 'textarea' && (
              <TextArea rows={4} value={config[f.key] ?? ''} onChange={(e) => setValue(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
            {f.type === 'number' && (
              // Sem `|| fallback` no onChange: o `NumericInput` devolve "" quando
              // o usuário apaga tudo, e trocar isso por um número faz o campo
              // "pular de volta" no meio da digitação. Campo vazio é estado
              // legítimo enquanto se digita — quem recusa é a validação do
              // Aplicar (o `required` abaixo), com toast.
              <NumericInput fullWidth value={config[f.key] ?? f.default ?? 0} onChange={(v) => setValue(f.key, v)} />
            )}
            {f.type === 'select' && (
              <Select value={config[f.key] ?? f.default ?? ''} onChange={(e) => setValue(f.key, e.target.value)}>
                {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
            {f.type === 'json' && (
              <TextArea
                rows={6}
                value={jsonDrafts[f.key] ?? ''}
                onChange={(e) => setJsonDrafts((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={'{ "chave": "valor" }'}
                style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
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
              <Input value={config[f.key] ?? f.default ?? ''} onChange={(e) => setValue(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
          </Field>
        ))}
      </div>
    </Drawer>
  );
}
