import React, { useEffect, useState } from 'react';
import { Drawer, Field, Input, Button, useToast, Spinner } from '@studio-ux-ds/react';
import {
  NodeFields, useNodeFieldRefs, initJsonDrafts, applyJsonDrafts, firstMissingRequired,
} from './NodeFields';

// Automação/editor/NodeInspector — configuração de UM passo, no editor em LISTA.
//
// Container: `Drawer` do DS — o **inspetor** (regra dos três containers, DS
// v1.2.24). O passo tem TextArea e JSON (fora do Modal) e é rascunho da sessão:
// só existe no servidor quando se salva uma versão, então rota exigiria persistir
// rascunho. `width={520}` porque JSON em 360px quebra em toda linha.
//
// O CONTEÚDO (os campos do passo) vem do `NodeFields`, compartilhado com o painel
// de propriedades do canvas — antes cada tela tinha o seu renderizador, e eles já
// haviam divergido (o tipo `agent` só existia no canvas).

export default function NodeInspector({ open, node, definition, onClose, onSave }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [config, setConfig] = useState({});
  const [jsonDrafts, setJsonDrafts] = useState({});

  const fields = definition?.fields || [];
  const { refs, loadingRefs } = useNodeFieldRefs(fields, { enabled: open });

  useEffect(() => {
    if (!open || !node) return;
    setName(node.name || definition?.label || '');
    setConfig({ ...(node.config || {}) });
    setJsonDrafts(initJsonDrafts(fields, node.config || {}));
  }, [open, node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !node || !definition) return null;

  function handleApply() {
    const parsed = applyJsonDrafts(fields, config, jsonDrafts);
    if (!parsed.ok) {
      toast.error(`O campo "${parsed.field.label}" não está num JSON válido.`);
      return;
    }
    const missing = firstMissingRequired(fields, parsed.config);
    if (missing) {
      toast.error(`Preencha "${missing.label}".`);
      return;
    }
    onSave({ ...node, name: name.trim() || definition.label, config: parsed.config });
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
            <Spinner />
          </div>
        )}

        <NodeFields
          fields={fields}
          config={config}
          jsonDrafts={jsonDrafts}
          refs={refs}
          onValue={(key, value) => setConfig((prev) => ({ ...prev, [key]: value }))}
          onJsonDraft={(key, text) => setJsonDrafts((prev) => ({ ...prev, [key]: text }))}
        />
      </div>
    </Drawer>
  );
}
