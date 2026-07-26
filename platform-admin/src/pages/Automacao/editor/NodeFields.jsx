import React, { useEffect, useState } from 'react';
import { Field, Input, TextArea, Select, NumericInput } from '@studio-ux-ds/react';
import { listConnections } from '../../../services/integrations';
import { listAutomationTemplates } from '../../../services/automation';
import { listAgents } from '../../../services/ai';

// Os campos de configuração de um passo — em UM lugar só (v0.10.4).
//
// Existiam DOIS renderizadores do mesmo catálogo declarativo: o `InspectorField`
// do canvas e o corpo do `NodeInspector` do editor em lista. E já haviam
// divergido: o canvas entendia o tipo `agent` (lista os assistentes num select) e
// a lista não — nela o mesmo campo caía no input de texto, pedindo que o usuário
// digitasse o id do assistente na mão. Ou seja: o mesmo passo, configurado de
// duas formas, dependendo da tela em que se abriu.
//
// Aqui ficam as três coisas que as duas telas precisam compartilhar:
//   · `useNodeFieldRefs`  — carrega as listas de referência que os campos pedem
//   · `NodeFields`        — renderiza os campos
//   · `initJsonDrafts` / `applyJsonDrafts` — o rascunho de texto dos campos JSON
//
// O container é escolha de cada tela (painel fixo no canvas, Drawer na lista);
// o que está aqui é o conteúdo, que não pode divergir.

/** Carrega só as listas que os campos deste passo realmente usam. */
export function useNodeFieldRefs(fields = [], { enabled = true } = {}) {
  const [refs, setRefs] = useState({ connections: [], templates: [], agents: [] });
  const [loading, setLoading] = useState(false);

  const needsConn = fields.some((f) => f.type === 'connection');
  const needsTpl = fields.some((f) => f.type === 'template');
  const needsAgent = fields.some((f) => f.type === 'agent');

  useEffect(() => {
    if (!enabled || (!needsConn && !needsTpl && !needsAgent)) return;
    setLoading(true);
    Promise.all([
      needsConn ? listConnections().then((r) => r.items).catch(() => []) : Promise.resolve([]),
      needsTpl ? listAutomationTemplates().then((r) => r.items).catch(() => []) : Promise.resolve([]),
      needsAgent ? listAgents().then((r) => r.items).catch(() => []) : Promise.resolve([]),
    ])
      .then(([connections, templates, agents]) => setRefs({ connections, templates, agents }))
      .finally(() => setLoading(false));
    // As listas de referência não mudam por passo — o que muda é PRECISAR delas.
  }, [enabled, needsConn, needsTpl, needsAgent]);

  return { refs, loadingRefs: loading };
}

/** Rascunho inicial dos campos JSON: objeto salvo → texto editável. */
export function initJsonDrafts(fields = [], config = {}) {
  const drafts = {};
  for (const f of fields.filter((x) => x.type === 'json')) {
    const v = config[f.key];
    drafts[f.key] = v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
  }
  return drafts;
}

/**
 * Texto dos campos JSON → objeto, na hora de salvar.
 * Devolve `{ ok: true, config }` ou `{ ok: false, field }` com o campo inválido —
 * quem chama decide como avisar (toast na lista, toast no canvas).
 */
export function applyJsonDrafts(fields = [], config = {}, jsonDrafts = {}) {
  const merged = { ...config };
  for (const f of fields.filter((x) => x.type === 'json')) {
    const raw = (jsonDrafts[f.key] ?? '').trim();
    if (!raw) { delete merged[f.key]; continue; }
    try {
      merged[f.key] = JSON.parse(raw);
    } catch {
      return { ok: false, field: f };
    }
  }
  return { ok: true, config: merged };
}

/** Primeiro campo obrigatório que ficou vazio (ou `null`). */
export function firstMissingRequired(fields = [], config = {}) {
  return fields.find(
    (f) => f.required && f.type !== 'json' && !String(config[f.key] ?? '').trim(),
  ) || null;
}

/**
 * Renderiza os campos que vêm da definition do passo. Declarativo: campo novo no
 * backend aparece nas duas telas sem tocar em nada aqui — desde que o `type` seja
 * um dos conhecidos; qualquer outro cai no campo de texto, que é degradação
 * aceitável (o valor continua editável).
 */
export function NodeFields({ fields = [], config = {}, jsonDrafts = {}, refs = {}, disabled = false, onValue, onJsonDraft }) {
  return fields.map((f) => (
    <Field key={f.key} label={f.label} required={f.required} hint={f.help}>
      {renderControl(f, { config, jsonDrafts, refs, disabled, onValue, onJsonDraft })}
    </Field>
  ));
}

function renderControl(f, { config, jsonDrafts, refs, disabled, onValue, onJsonDraft }) {
  const value = config[f.key];
  const set = (v) => onValue(f.key, v);

  switch (f.type) {
    case 'textarea':
      return (
        <TextArea rows={4} value={value ?? ''} placeholder={f.placeholder} disabled={disabled}
          onChange={(e) => set(e.target.value)} />
      );

    case 'number':
      // Sem `|| fallback` no onChange: o NumericInput devolve "" quando se apaga
      // tudo, e trocar por um número faz o campo pular de volta no meio da
      // digitação. Vazio é estado legítimo; quem recusa é a validação ao salvar.
      return <NumericInput fullWidth value={value ?? f.default ?? 0} disabled={disabled} onChange={set} />;

    case 'select':
      return (
        <Select value={value ?? f.default ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)}>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );

    case 'json':
      return (
        <TextArea
          rows={6}
          value={jsonDrafts[f.key] ?? ''}
          placeholder={'{ "chave": "valor" }'}
          spellCheck={false}
          disabled={disabled}
          onChange={(e) => onJsonDraft(f.key, e.target.value)}
          style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
        />
      );

    case 'agent':
      return (
        <Select value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)}>
          <option value="">— escolha um assistente —</option>
          {(refs.agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      );

    case 'connection':
      return (
        <Select value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)}>
          <option value="">— nenhuma —</option>
          {(refs.connections || []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.provider_key})</option>)}
        </Select>
      );

    case 'template':
      return (
        <Select value={value ?? ''} disabled={disabled} onChange={(e) => set(e.target.value)}>
          <option value="">— nenhum —</option>
          {(refs.templates || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
        </Select>
      );

    default:
      return (
        <Input value={value ?? f.default ?? ''} placeholder={f.placeholder} disabled={disabled}
          onChange={(e) => set(e.target.value)} />
      );
  }
}
