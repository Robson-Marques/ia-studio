import React from 'react';
import { Field, Input, Select, Button, CopyButton } from '@studio-ux-ds/react';

// Renderizador declarativo dos campos do `wizard_schema` — COMPARTILHADO entre a
// criação (`ConexaoNova`) e a edição (`ConexaoEditar`). Nenhum código por tipo de
// conector: o schema descreve, isto renderiza. Migrado pro DS na v0.10.11.
//
// Comportamentos que o schema aciona:
//  · `field.generatable` → botão "Gerar" (token aleatório) + copiar. O campo fica
//    VISÍVEL mesmo sendo secreto: o usuário precisa enxergar o valor para colar
//    no painel da Meta. Esconder aqui não protege nada e impede o trabalho.
//  · `editing=true` em campo secreto → nunca pré-preenche e avisa que deixar em
//    branco mantém o valor atual. O cofre não devolve o segredo; sem essa dica,
//    o campo vazio parece "apagado".
//
// O `copyToClipboard` local morreu na v0.10.11: o `CopyButton` do DS faz a mesma
// coisa com o fallback e a confirmação padronizados.

// Token aleatório legível para o campo (ex.: verify_token do webhook).
export function generateToken() {
  const bytes = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `ias_${hex}`;
}

// Caixa com a URL do webhook (origin + schema.webhookPath) pronta pra colar na Meta.
export function WebhookUrlBox({ webhookPath }) {
  if (!webhookPath) return null;
  const url = `${window.location.origin}${webhookPath}`;
  return (
    <div
      style={{
        border: '1px solid var(--su-border-default)',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
        Endereço do webhook (cole no painel da Meta)
      </p>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1, fontSize: 12 }} />
        <CopyButton value={url} title="Copiar o endereço" />
      </div>
      <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
        Na Meta: WhatsApp → Configuration → Webhook. Cole este endereço junto do token acima e assine o campo “messages”.
      </p>
    </div>
  );
}

// Renderiza UM campo do schema. `editing` muda o comportamento dos secretos.
export function ConnectionField({ field, value, onChange, namePrefix, editing = false }) {
  const isSecret = field.secret || field.type === 'password';
  const masked = isSecret && !field.generatable;
  const hint = editing && isSecret
    ? [field.help, 'Deixe em branco para manter o valor atual.'].filter(Boolean).join(' ')
    : field.help;

  if (field.type === 'select') {
    return (
      <Field label={field.label} required={field.required && !editing} hint={hint}>
        <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione…</option>
          {(field.options || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>
    );
  }

  return (
    <Field label={field.label} required={field.required && !editing} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type={masked ? 'password' : field.type === 'number' ? 'number' : 'text'}
          name={`${namePrefix}-${field.key}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={editing && isSecret ? 'Deixe em branco para manter' : field.placeholder}
          // Bloqueia o autofill do navegador: new-password nos secretos, off nos demais.
          autoComplete={masked ? 'new-password' : 'off'}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          style={{ flex: 1 }}
        />
        {field.generatable && (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="zap"
              title="Gerar um token aleatório para este campo"
              onClick={() => onChange(generateToken())}
            >
              Gerar
            </Button>
            <CopyButton value={String(value ?? '')} title="Copiar o valor" />
          </>
        )}
      </div>
    </Field>
  );
}
