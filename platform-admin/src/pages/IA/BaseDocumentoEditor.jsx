import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, Field, Input, Select, TextArea, Button, useToast,
} from '@studio-ux-ds/react';
import { getKnowledgeBase, addKnowledgeDocument } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';

// IA/BaseDocumentoEditor — adicionar documento a uma base (v0.9.89).
// Promovido a rota porque o form tem TextArea de conteúdo — no legado eram 8
// linhas dentro de um Modal `size="lg"`, exatamente o caso que a regra do DS
// (v1.2.12) proíbe: colar/escrever um documento inteiro preso atrás do scrim,
// sem ver a base a que ele pertence. Aqui o campo respira (18 linhas) e o
// cabeçalho diz em qual base o documento vai entrar.
//
// Rota: /ia/conhecimento/:id/documentos/novo

const MODES = [
  { value: 'TXT',      label: 'Texto colado' },
  { value: 'MARKDOWN', label: 'Markdown' },
  { value: 'URL',      label: 'Endereço de uma página (URL)' },
];

export default function BaseDocumentoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { can } = usePermissions();

  const canWrite = can('ai.knowledge.write');

  const [base, setBase] = useState(location.state?.base ?? null);
  const [loadingBase, setLoadingBase] = useState(!location.state?.base);
  const [mode, setMode] = useState('TXT');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (base) return;
    let alive = true;
    (async () => {
      setLoadingBase(true);
      try {
        const b = await getKnowledgeBase(id);
        if (alive) setBase(b);
      } catch (err) {
        if (!alive) return;
        toast.error(err.message);
        navigate('/ia/conhecimento', { replace: true });
      } finally {
        if (alive) setLoadingBase(false);
      }
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocar a origem limpa o que já foi preenchido (mesmo comportamento do legado
  // — o conteúdo de um modo não faz sentido no outro).
  useEffect(() => { setText(''); setUrl(''); setRef(''); }, [mode]);

  const backTo = `/ia/conhecimento/${id}`;

  async function handleSave() {
    if (!canWrite) { toast.error('Sem permissão.'); return; }
    let body;
    if (mode === 'URL') {
      if (!url.trim()) { toast.error('Informe o endereço da página.'); return; }
      body = { source_type: 'URL', source_ref: url.trim() };
    } else {
      if (!text.trim()) { toast.error('Cole o conteúdo do documento.'); return; }
      body = {
        source_type: mode,
        source_ref: ref.trim() || (mode === 'MARKDOWN' ? 'Markdown colado' : 'Texto colado'),
        text: text.trim(),
      };
    }
    setSaving(true);
    try {
      await addKnowledgeDocument(id, body);
      toast.success('Documento adicionado — a indexação está em andamento.');
      navigate(backTo);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingBase) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adicionar documento"
        subtitle={base?.name ? `Vai entrar na base "${base.name}".` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(backTo)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canWrite}
              loading={saving}
              icon="check"
            >
              {saving ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div style={{ maxWidth: 360 }}>
            <Field label="De onde vem o conteúdo">
              <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
          </div>

          {mode === 'URL' ? (
            <Field
              label="Endereço da página"
              hint="A plataforma abre a página e extrai o texto dela."
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://exemplo.com/faq"
              />
            </Field>
          ) : (
            <>
              <Field label="Como chamar este documento" hint="É o nome que aparece na lista da base.">
                <Input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Ex.: Política de trocas"
                />
              </Field>

              <Field
                label={mode === 'MARKDOWN' ? 'Conteúdo em Markdown' : 'Conteúdo'}
                hint={mode === 'MARKDOWN'
                  ? 'Aceita títulos, listas e o resto da sintaxe Markdown.'
                  : 'Cole o texto inteiro — a plataforma divide em trechos e indexa.'}
              >
                <TextArea
                  rows={18}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={mode === 'MARKDOWN' ? '# Título\n\n- item…' : 'Cole aqui o conteúdo…'}
                  style={mode === 'MARKDOWN'
                    ? { fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }
                    : undefined}
                />
              </Field>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
