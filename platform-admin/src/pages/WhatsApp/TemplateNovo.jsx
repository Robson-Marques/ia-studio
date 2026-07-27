import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHeader, Card, Field, Input, TextArea, Select, Badge, Button, IconButton, useToast,
} from '@studio-ux-ds/react';
import { createTemplate, listNumbers } from '../../services/whatsapp';
import { CATEGORY_LABEL, LANGUAGE_LABEL } from './Templates';

// WhatsApp/TemplateNovo — criar um template e mandar para análise da Meta (v0.10.9).
//
// Rota `/whatsapp/templates/novo`. Era Modal `size="lg"`; tem TextArea (o corpo) e
// vai pra rota pela regra do Modal do DS. O ganho não é só de regra: o formulário
// tem cabeçalho, corpo, exemplos das variáveis, rodapé e até 3 botões — apertado
// num overlay, confortável numa tela.
//
// A validação é a da Meta, dita em português: nome só com minúsculas/números/_,
// corpo obrigatório, e **um exemplo para cada `{{n}}`** (sem isso a Meta recusa e
// o template fica como rascunho).

const EMPTY = {
  name: '', category: 'UTILITY', language: 'pt_BR',
  header_text: '', body_text: '', footer_text: '', buttons: [],
};

const BUTTON_LABEL = {
  QUICK_REPLY: 'Resposta rápida',
  URL: 'Abrir um link',
  PHONE_NUMBER: 'Ligar para um número',
};

export default function TemplateNovo() {
  const toast = useToast();
  const navigate = useNavigate();
  const [numbers, setNumbers] = useState([]);
  const [connectionId, setConnectionId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [examples, setExamples] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listNumbers()
      .then((n) => {
        setNumbers(n);
        if (n.length) setConnectionId((atual) => atual || n[0].id);
      })
      .catch((err) => toast.error(err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setField(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  const variaveis = useMemo(() => {
    const achadas = form.body_text.match(/\{\{\d+\}\}/g) || [];
    return [...new Set(achadas)];
  }, [form.body_text]);

  function addButton() {
    if (form.buttons.length >= 3) { toast.error('A Meta aceita no máximo 3 botões.'); return; }
    setField('buttons', [...form.buttons, { type: 'QUICK_REPLY', text: '', url: '' }]);
  }

  function setButton(i, key, value) {
    setField('buttons', form.buttons.map((b, idx) => (idx === i ? { ...b, [key]: value } : b)));
  }

  async function handleSave() {
    if (!connectionId) { toast.error('Escolha em qual número o template vai existir.'); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      toast.error('O nome aceita só letras minúsculas, números e _ (exemplo: boas_vindas).');
      return;
    }
    if (!form.body_text.trim()) { toast.error('Escreva o corpo da mensagem.'); return; }
    const exemplos = examples.split(',').map((s) => s.trim()).filter(Boolean);
    if (variaveis.length > 0 && exemplos.length < variaveis.length) {
      toast.error(`A Meta exige um exemplo para cada variável — informe ${variaveis.length}, separados por vírgula.`);
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
            type: b.type,
            text: b.text,
            ...(b.type === 'URL' ? { url: b.url } : {}),
            ...(b.type === 'PHONE_NUMBER' ? { phone_number: b.url } : {}),
          }))
          : undefined,
        body_examples: exemplos.length ? exemplos : undefined,
      });
      toast.success('Enviado para análise da Meta — a resposta costuma sair em minutos.');
      navigate('/whatsapp/templates');
    } catch (err) {
      // Recusa da Meta deixa o template como rascunho aqui: a lista mostra o
      // motivo, então vale mandar o usuário para lá em vez de só reclamar.
      toast.error(err.message);
      navigate('/whatsapp/templates');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo template"
        subtitle="Depois de aprovado pela Meta, este texto pode ser enviado a quem não respondeu nas últimas 24 horas."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/whatsapp/templates')} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              Enviar para análise
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Em qual número" required hint="O template pertence ao número — não é compartilhado entre eles.">
              <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                {!numbers.length && <option value="">nenhum número conectado</option>}
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}{n.phone ? ` — ${n.phone}` : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="Nome" required hint="Só minúsculas, números e _ . Não pode ser reaproveitado depois de excluído.">
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value.toLowerCase())}
                placeholder="boas_vindas"
                style={{ fontFamily: 'var(--su-font-mono, monospace)' }}
              />
            </Field>
            <Field label="Tipo" required hint="Utilidade: aviso sobre algo que a pessoa fez. Divulgação: oferta.">
              <Select value={form.category} onChange={(e) => setField('category', e.target.value)}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Idioma" required>
              <Select value={form.language} onChange={(e) => setField('language', e.target.value)}>
                {Object.entries(LANGUAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Cabeçalho" hint="Uma linha em destaque no topo. Opcional, até 60 caracteres.">
            <Input value={form.header_text} onChange={(e) => setField('header_text', e.target.value)} maxLength={60} />
          </Field>

          <Field
            label="Corpo da mensagem"
            required
            hint="Use {{1}}, {{2}}… onde o texto muda de pessoa para pessoa. Até 1024 caracteres."
          >
            <TextArea
              rows={6}
              value={form.body_text}
              onChange={(e) => setField('body_text', e.target.value)}
              maxLength={1024}
              placeholder={'Olá {{1}}, sua visita está marcada para {{2}}.'}
            />
          </Field>

          {variaveis.length > 0 && (
            <Field
              label={`Exemplo para cada variável (${variaveis.length})`}
              required
              hint="Separados por vírgula, na ordem. A Meta recusa o template sem isso."
            >
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {variaveis.map((v) => <Badge key={v} tone="info">{v}</Badge>)}
                </div>
                <Input value={examples} onChange={(e) => setExamples(e.target.value)} placeholder="João, 25/12 às 14h" />
              </div>
            </Field>
          )}

          <Field label="Rodapé" hint="Linha pequena no fim, sem variáveis. Opcional.">
            <Input value={form.footer_text} onChange={(e) => setField('footer_text', e.target.value)} maxLength={60} />
          </Field>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 style={{ flex: 1, fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Botões
            </h2>
            <Button variant="secondary" size="sm" icon="plus" onClick={addButton}>Adicionar botão</Button>
          </div>
          <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>
            Até 3. “Resposta rápida” devolve o texto do botão como mensagem do cliente; “abrir um link” leva para um endereço seu.
          </p>

          {!form.buttons.length ? (
            <p className="text-xs" style={{ margin: 0, color: 'var(--su-text-muted)' }}>Nenhum botão — a mensagem vai só com texto.</p>
          ) : (
            <div className="space-y-2">
              {form.buttons.map((b, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div style={{ width: 180 }}>
                    <Select value={b.type} onChange={(e) => setButton(i, 'type', e.target.value)} aria-label={`Tipo do botão ${i + 1}`}>
                      {Object.entries(BUTTON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Input
                      value={b.text}
                      maxLength={25}
                      placeholder="Texto do botão"
                      aria-label={`Texto do botão ${i + 1}`}
                      onChange={(e) => setButton(i, 'text', e.target.value)}
                    />
                  </div>
                  {b.type !== 'QUICK_REPLY' && (
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <Input
                        value={b.url}
                        placeholder={b.type === 'URL' ? 'https://…' : '+55 27 99999-9999'}
                        aria-label={b.type === 'URL' ? `Link do botão ${i + 1}` : `Telefone do botão ${i + 1}`}
                        onChange={(e) => setButton(i, 'url', e.target.value)}
                      />
                    </div>
                  )}
                  <IconButton
                    icon="trash"
                    aria-label={`Remover o botão ${i + 1}`}
                    title="Remover este botão"
                    onClick={() => setField('buttons', form.buttons.filter((_, idx) => idx !== i))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
