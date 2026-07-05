import React from 'react';
import { Copy, Sparkles } from 'lucide-react';
import { FormField, TextInput, Select } from '../../components/ui/FormField';
import { toast } from '../../lib/toast';

// Renderizador declarativo dos campos do wizard_schema — COMPARTILHADO entre o
// ConnectionWizard (criação) e o EditConnectionModal (edição). Nenhum código
// por tipo de conector: o schema descreve, isto renderiza.
//
// Extras:
//  - field.generatable → botão "Gerar" (token aleatório) + "Copiar".
//  - editing=true em campos secretos → placeholder "Deixe em branco para
//    manter o atual" e nunca pré-preenche o valor.

// Token aleatório legível para o campo (ex.: verify_token do webhook).
export function generateToken() {
  const bytes = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `ias_${hex}`;
}

export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback para contextos sem clipboard API (http/iframe antigos).
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success('Copiado');
  } catch {
    toast.error('Não foi possível copiar. Copie manualmente.');
  }
}

// Caixa com a URL do webhook (origin + schema.webhookPath) pronta pra colar na Meta.
export function WebhookUrlBox({ webhookPath }) {
  if (!webhookPath) return null;
  const url = `${window.location.origin}${webhookPath}`;
  return (
    <div
      className="rounded-lg px-3 py-2.5 space-y-1.5"
      style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border-sub)' }}
    >
      <p className="text-[11px] font-medium" style={{ color: 'var(--ap-text-2)' }}>
        Webhook URL (cole no painel da Meta)
      </p>
      <div className="flex items-center gap-1.5">
        <TextInput value={url} readOnly onFocus={(e) => e.target.select()} className="flex-1 text-xs" />
        <button type="button" className="btn-ghost p-2 shrink-0" title="Copiar URL" onClick={() => copyToClipboard(url)}>
          <Copy size={14} className="text-brand" />
        </button>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--ap-text-4)' }}>
        No Meta: WhatsApp → Configuration → Webhook, cole esta URL + o Verify Token acima, e assine o campo "messages".
      </p>
    </div>
  );
}

// Renderiza UM campo do schema. `editing` muda o comportamento dos secretos.
export function ConnectionField({ field, value, onChange, namePrefix, editing = false }) {
  const isSecret = field.secret || field.type === 'password';
  // Campo generatable (ex.: verify_token) fica VISÍVEL — o usuário precisa
  // enxergar e copiar o valor pra colar no painel da Meta.
  const masked = isSecret && !field.generatable;
  const placeholder = editing && isSecret ? 'Deixe em branco para manter o atual' : field.placeholder;

  if (field.type === 'select') {
    return (
      <FormField label={field.label} required={field.required && !editing} hint={field.help}>
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione…</option>
          {(field.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </FormField>
    );
  }

  return (
    <FormField label={field.label} required={field.required && !editing} hint={field.help}>
      <div className="flex items-center gap-1.5">
        <TextInput
          type={masked ? 'password' : field.type === 'number' ? 'number' : 'text'}
          name={`${namePrefix}-${field.key}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          // Bloqueia autofill do navegador: new-password nos secretos + off nos demais.
          autoComplete={masked ? 'new-password' : 'off'}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className="flex-1"
        />
        {field.generatable && (
          <>
            <button
              type="button"
              className="btn-secondary px-2 py-1.5 shrink-0 text-xs"
              title="Gerar token aleatório"
              onClick={() => onChange(generateToken())}
            >
              <Sparkles size={13} /> Gerar
            </button>
            <button
              type="button"
              className="btn-ghost p-2 shrink-0"
              title="Copiar valor"
              onClick={() => copyToClipboard(String(value ?? ''))}
            >
              <Copy size={14} className="text-brand" />
            </button>
          </>
        )}
      </div>
    </FormField>
  );
}
