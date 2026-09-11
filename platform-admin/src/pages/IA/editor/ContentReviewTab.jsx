import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, EmptyState, Spinner, useToast } from '@studio-ux-ds/react';
import { listContentReviews, reviewAgentContent, exportContentReview } from '../../../services/ai';

// AgenteEditor › aba "Revisão" (Checkpoint 2b). Compara por IA as fontes de
// conhecimento vinculadas ao assistente e lista conflitos/redundâncias/lacunas/
// riscos de promessa. Espelha o padrão da TestTab (gated em `agentId`). Só
// tokens `--su-*`, sem cor fixa.

const SEVERITY = {
  CRITICAL:    { label: 'Crítico',  tone: 'danger' },
  ATTENTION:   { label: 'Atenção',  tone: 'warning' },
  IMPROVEMENT: { label: 'Melhoria', tone: 'info' },
};
const CATEGORY = {
  CONFLICT: 'Conflito',
  REDUNDANCY: 'Redundância',
  GAP: 'Lacuna',
  PROMISE_RISK: 'Risco de promessa',
};

function StatusBadge({ review }) {
  if (review.status === 'FAILED') return <Badge tone="danger">Falhou</Badge>;
  if (review.status !== 'COMPLETED') return <Badge tone="neutral">Processando</Badge>;
  const status = review.result_json?.status;
  return status === 'COHERENT'
    ? <Badge tone="success">Coerente</Badge>
    : <Badge tone="warning">Pontos a conferir</Badge>;
}

function ReviewDetail({ review }) {
  const muted = { fontSize: 12, color: 'var(--su-text-muted)', margin: 0 };
  if (review.status === 'FAILED') {
    return <p style={{ ...muted, color: 'var(--su-danger-fg)' }}>{review.error || 'A revisão falhou.'}</p>;
  }
  const result = review.result_json;
  if (!result) return <p style={muted}>Sem resultado registrado.</p>;

  return (
    <div className="space-y-3">
      {result.summary && (
        <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-primary)' }}>{result.summary}</p>
      )}

      {result.issues?.length ? (
        <div className="space-y-2">
          {result.issues.map((issue, i) => {
            const sev = SEVERITY[issue.severity] || { label: issue.severity, tone: 'neutral' };
            return (
              <div key={i} style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12 }}>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                  <Badge tone={sev.tone}>{sev.label}</Badge>
                  <Badge tone="neutral">{CATEGORY[issue.category] || issue.category}</Badge>
                </div>
                <strong style={{ color: 'var(--su-text-primary)' }}>{issue.title}</strong>
                <p style={{ fontSize: 13, margin: '4px 0 0', color: 'var(--su-text-secondary)' }}>{issue.explanation}</p>
                <p style={{ fontSize: 13, margin: '6px 0 0', color: 'var(--su-text-primary)' }}>
                  <strong>Recomendação:</strong> {issue.recommendation}
                </p>
                {issue.sources?.length ? (
                  <div style={{ marginTop: 8 }}>
                    {issue.sources.map((s, j) => (
                      <p key={j} style={{ ...muted, fontStyle: 'italic', marginTop: 2 }}>
                        “{s.excerpt}” — {s.base_name} / {s.document_title}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p style={muted}>Nenhum apontamento — as fontes estão coerentes nesta revisão.</p>
      )}

      {result.strengths?.length ? (
        <div>
          <strong style={{ fontSize: 13, color: 'var(--su-text-primary)' }}>Pontos fortes</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {result.strengths.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: 'var(--su-text-secondary)' }}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function ContentReviewTab({ agentId, canReview }) {
  const toast = useToast();
  const [reviews, setReviews] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  async function load(selectLatest = false) {
    if (!agentId) return;
    setLoading(true);
    try {
      const list = await listContentReviews(agentId);
      setReviews(list);
      if (selectLatest && list.length) setSelectedId(list[0].id);
      else if (!selectedId && list.length) setSelectedId(list[0].id);
    } catch (err) {
      toast.error(err.message);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(
    () => (reviews || []).find((r) => r.id === selectedId) || (reviews || [])[0] || null,
    [reviews, selectedId],
  );

  async function handleExport() {
    if (!selected || exporting) return;
    setExporting(true);
    try {
      await exportContentReview(agentId, selected.id, 'pdf');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleReview() {
    if (running) return;
    setRunning(true);
    try {
      const created = await reviewAgentContent(agentId);
      const status = created?.result_json?.status;
      const count = created?.result_json?.issues?.length || 0;
      if (status === 'COHERENT') toast.success('Revisão concluída — as fontes estão coerentes.');
      else toast.success(`Revisão concluída — ${count} ${count === 1 ? 'ponto a conferir.' : 'pontos a conferir.'}`);
      setSelectedId(created?.id || null);
      await load(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  if (!agentId) {
    return (
      <Card>
        <EmptyState
          icon="settings"
          title="Salve antes de revisar"
          description="A revisão compara as fontes do assistente salvo — clique em Salvar para habilitar."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ padding: 20 }} className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p style={{ fontSize: 12, margin: 0, maxWidth: 620, color: 'var(--su-text-muted)' }}>
            A IA compara as fontes de conhecimento vinculadas a este assistente e aponta conflitos, redundâncias, lacunas
            e riscos de promessa. É só leitura — não altera nada. Requer conexão de IA ativa e ao menos duas fontes prontas.
          </p>
          <Button
            variant="primary" icon="bot" loading={running}
            disabled={!canReview}
            title={canReview ? 'Comparar as fontes deste assistente' : 'Você pode ver, mas não disparar revisões'}
            onClick={handleReview}
          >
            Revisar conteúdo
          </Button>
        </div>

        {loading && reviews === null ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : !reviews?.length ? (
          <EmptyState
            icon="search"
            title="Nenhuma revisão ainda"
            description="Clique em Revisar conteúdo para comparar as fontes deste assistente."
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--su-space-3)' }}>
            {selected && (
              <div>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 8 }}>
                  <StatusBadge review={selected} />
                  <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>
                    {selected.created_at ? new Date(selected.created_at).toLocaleString('pt-BR') : ''}
                  </span>
                  {selected.status === 'COMPLETED' && (
                    <Button
                      variant="ghost" size="sm" icon="download" loading={exporting}
                      style={{ marginLeft: 'auto' }}
                      title="Baixar esta revisão em PDF"
                      onClick={handleExport}
                    >
                      Exportar PDF
                    </Button>
                  )}
                </div>
                <ReviewDetail review={selected} />
              </div>
            )}

            {reviews.length > 1 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px', color: 'var(--su-text-secondary)' }}>
                  Revisões anteriores
                </p>
                <div style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, overflow: 'hidden' }}>
                  {reviews.map((r, i) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className="flex items-center gap-2 w-full text-left px-3 py-2"
                      style={{
                        background: r.id === selected?.id ? 'var(--su-surface-hover, var(--su-surface-overlay))' : 'transparent',
                        border: 0, borderTop: i ? '1px solid var(--su-border-subtle, var(--su-border-default))' : 'none',
                        cursor: 'pointer', font: 'inherit',
                      }}
                    >
                      <StatusBadge review={r} />
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--su-text-muted)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
