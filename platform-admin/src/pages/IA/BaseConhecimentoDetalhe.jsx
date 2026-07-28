import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageHeader, Tabs, Card, DataTable, EmptyState, Badge, DescriptionList, FormRow, Field, Input, NumericInput, Button, ConfirmDialog, useToast, Spinner } from '@studio-ux-ds/react';
import {
  getKnowledgeBase, deleteKnowledgeBase, queryKnowledgeBase,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { DOC_STATUS, formatDateTime } from './ia.constants';
import { statusToTone } from '../../lib/tone';

// IA/BaseConhecimentoDetalhe — uma base de conhecimento (v0.9.89).
//
// Rota: /ia/conhecimento/:id — destino do clique na linha da lista. No legado
// isso era `useState('selected')` com botão voltar fabricado (URL não mudava,
// F5 perdia o contexto); promovido a rota real, igual foi feito na Memória.
//
// Duas decisões de composição:
//
//  1) O `QueryModal` do legado ("Testar consulta") virou uma ABA, não um Modal.
//     Ele passaria no teste mecânico da regra do Modal (não tem TextArea), mas é
//     uma bancada iterativa — digita, roda, lê os trechos recuperados, refina — e
//     os trechos podem ser longos. Aba de tela de detalhe é o padrão do DS pra
//     "entidade com múltiplas dimensões" (PATTERNS §1) e dá a altura que os
//     trechos precisam. Nada foi inventado: Tabs já é componente do catálogo.
//
//  2) Excluir a base vive AQUI (não na linha da lista, onde estava): é
//     destrutivo e o operador precisa ver quantos documentos vai perder antes
//     de confirmar. Carrega os 5 patrasques — ConfirmDialog + disclaimer na
//     mensagem + tooltip no botão + loading + gate `can()`.
//
// A tabela de documentos NÃO tem linha clicável: não existe endpoint de leitura
// de documento individual, então não há destino (caso 3 da árvore de decisão do
// STUDIO_UX_TABLES.md — não inventar rota que não existe só pra cumprir a regra).

const PAGE_TABS = [
  { id: 'docs',  label: 'Documentos' },
  { id: 'query', label: 'Testar consulta' },
];

export default function BaseConhecimentoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { can } = usePermissions();

  const canWrite = can('ai.knowledge.write');

  const [base, setBase] = useState(location.state?.base ?? null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('docs');
  const [removing, setRemoving] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setBase(await getKnowledgeBase(id));
    } catch (err) {
      toast.error(err.message);
      navigate('/ia/conhecimento', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmRemove() {
    setRemoveLoading(true);
    try {
      await deleteKnowledgeBase(id);
      toast.success('Base excluída.');
      navigate('/ia/conhecimento');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRemoveLoading(false);
      setRemoving(false);
    }
  }

  // O `load` inicial sempre roda (mesmo vindo com base no state) para trazer os
  // documentos, que a listagem não devolve. Enquanto isso, se já temos a base do
  // state, mostramos o cabeçalho em vez de uma tela em branco.
  if (loading && !base) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </div>
    );
  }

  if (!base) return null;

  const docs = base.documents || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={base.name}
        subtitle={base.description || `${docs.length} documento(s) indexado(s) para consulta dos assistentes.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/conhecimento')}>
              Voltar
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="danger"
                  icon="trash"
                  title="Excluir a base e tudo que ela indexou — não dá para desfazer"
                  onClick={() => setRemoving(true)}
                >
                  Excluir base
                </Button>
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => navigate(`/ia/conhecimento/${id}/documentos/novo`, { state: { base } })}
                >
                  Adicionar documento
                </Button>
              </>
            )}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }}>
          <DescriptionList
            items={[
              { key: 'Documentos', value: String(docs.length) },
              { key: 'Modelo de indexação', value: <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}>{base.embedding_model}</span> },
              { key: 'Tamanho do trecho', value: `${base.chunk_size} caracteres (sobreposição de ${base.chunk_overlap})` },
              { key: 'Atualizada em', value: formatDateTime(base.updated_at) },
            ]}
          />
        </div>
      </Card>

      <Tabs items={PAGE_TABS} value={tab} onChange={setTab} />

      {tab === 'docs'
        ? <DocsTab docs={docs} loading={loading} canWrite={canWrite} baseId={id} base={base} />
        : <QueryTab baseId={id} />}

      {/* 5 patrasques: ConfirmDialog + disclaimer na mensagem + tooltip no botão
          + loading + gate can(). ConfirmDialog não tem campo → segue Modal. */}
      <ConfirmDialog
        open={removing}
        danger
        loading={removeLoading}
        title="Excluir base de conhecimento"
        message={`Excluir "${base.name}"? Os ${docs.length} documento(s) e tudo que foi indexado a partir deles são removidos, e os assistentes que consultam esta base param de encontrar essas respostas. Não dá para desfazer.`}
        confirmLabel="Excluir base"
        onClose={() => setRemoving(false)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function DocsTab({ docs, loading, canWrite, baseId, base }) {
  const navigate = useNavigate();

  const columns = [
    { key: 'source_ref', header: 'Documento', render: (d) => (
      <span style={{ display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--su-text-primary)' }}>
        {d.source_ref || d.id}
      </span>
    ) },
    { key: 'source_type', header: 'Origem', render: (d) => <Badge tone="neutral">{d.source_type}</Badge> },
    { key: 'status', header: 'Situação', render: (d) => {
      const st = DOC_STATUS[d.status] || { label: d.status, variant: 'gray' };
      return (
        <div>
          <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>
          {d.error && (
            <p style={{ fontSize: 10, marginTop: 2, marginBottom: 0, color: 'var(--su-danger)' }}>{d.error}</p>
          )}
        </div>
      );
    } },
    { key: 'chunk_count', header: 'Trechos', align: 'right', render: (d) => d.chunk_count ?? 0 },
    { key: 'created_at', header: 'Adicionado', render: (d) => formatDateTime(d.created_at) },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!docs.length) {
    return (
      <Card>
        <EmptyState
          icon="file"
          title="Sem documentos"
          description="Cole um texto ou aponte uma página para esta base começar a servir os assistentes."
          action={canWrite ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => navigate(`/ia/conhecimento/${baseId}/documentos/novo`, { state: { base } })}
            >
              Adicionar documento
            </Button>
          ) : undefined}
        />
      </Card>
    );
  }

  // Sem onRowClick: não há endpoint de documento individual, então a linha não
  // tem destino (caso 3 da árvore do STUDIO_UX_TABLES.md).
  return <DataTable columns={columns} rows={docs} getRowId={(d) => d.id} />;
}

function QueryTab({ baseId }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(4);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [ran, setRan] = useState(false);

  async function handleQuery() {
    if (!query.trim()) { toast.error('Escreva a pergunta que quer testar.'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res = await queryKnowledgeBase(baseId, { query: query.trim(), top_k: topK });
      setResult(res);
      setRan(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  const chunks = result?.chunks || result?.results || result?.items || [];

  return (
    <div className="space-y-4">
      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
            Simula o que o assistente encontraria nesta base ao receber essa pergunta. Nada é enviado a ninguém.
          </p>
          {/* `FormRow` do DS (v1.2.49) no lugar do `flex items-end` à mão: o
              botão cai na linha dos controles por medição, e o campo principal
              cresce até um teto em vez de esticar até a borda do cartão. */}
          <FormRow
            action={
              <Button variant="primary" icon="search" loading={running} onClick={handleQuery}>
                {running ? 'Consultando…' : 'Consultar'}
              </Button>
            }
          >
            <Field grow label="Pergunta de teste">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !running) handleQuery(); }}
                placeholder="Ex.: qual o prazo de entrega?"
              />
            </Field>
            <Field label="Quantos trechos">
              <NumericInput value={topK} onChange={(v) => setTopK(v)} min={1} max={20} step={1} fullWidth />
            </Field>
          </FormRow>
        </div>
      </Card>

      {ran && !chunks.length && !running && (
        <Card>
          <EmptyState
            icon="search"
            title="Nada relevante encontrado"
            description="Esta base não tem trecho que responda a essa pergunta. Adicione o documento que cobre o assunto."
          />
        </Card>
      )}

      {chunks.length > 0 && (
        <div className="space-y-2">
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--su-text-muted)', margin: 0 }}>
            Trechos que o assistente usaria
          </p>
          {chunks.map((c, i) => (
            <Card key={c.id || i}>
              <div style={{ padding: 16 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Badge tone="info">
                    relevância {Number(c.score ?? c.similarity ?? 0).toFixed(3)}
                  </Badge>
                  <span style={{ fontSize: 11, color: 'var(--su-text-muted)' }}>
                    trecho {(c.idx ?? i) + 1}
                  </span>
                </div>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, color: 'var(--su-text-secondary)' }}>
                  {c.content}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
