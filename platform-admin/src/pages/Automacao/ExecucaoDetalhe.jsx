import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader, Card, Badge, Button, ConfirmDialog, DescriptionList, Timeline, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { getExecution, retryExecution, cancelExecution } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { EXECUTION_STATUS, TRIGGER_TYPE_LABEL, formatDateTime } from './automation.constants';
import { statusToTone } from '../../lib/tone';

// Automação/ExecucaoDetalhe — uma execução (v0.9.99).
//
// Rota: /automacao/execucoes/:id — antes era Modal `size="xl"` aberto por
// `?open=<id>`. Ver o comentário em `Execucoes.jsx` para o porquê da promoção.
//
// O passo a passo usa o `Timeline` do DS (o componente de histórico do catálogo)
// em vez da lista de divs com bolinha colorida do legado — que, aliás, pintava a
// bolinha com hex cravado (`#ef4444`/`#eab308`/`#22c55e`), fora do tema.
// **Limitação conhecida:** o `Timeline` do DS não tem `tone` por item, então o
// nível do passo (erro / aviso / ok) vai como `Badge` dentro do título. Fica
// registrado como candidato a evolução do DS — não inventei um Timeline paralelo
// aqui só para ter a cor.

const LOG_LEVEL = {
  error: { label: 'erro',  tone: 'danger' },
  warn:  { label: 'aviso', tone: 'warning' },
};

export default function ExecucaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const canRetry = can('automation.executions.retry');

  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null); // 'retry' | 'cancel'
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setExecution(await getExecution(id));
    } catch (err) {
      toast.error(err.message);
      navigate('/automacao/execucoes', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm() {
    setActing(true);
    try {
      if (confirm === 'retry') {
        await retryExecution(id);
        toast.success('Reexecução na fila — ela aparece como uma execução nova.');
        navigate('/automacao/execucoes');
      } else {
        await cancelExecution(id);
        toast.success('Execução cancelada.');
        setConfirm(null);
        load();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </div>
    );
  }

  if (!execution) return null;

  const info = EXECUTION_STATUS[execution.status] || { label: execution.status, variant: 'gray' };
  const cancellable = ['QUEUED', 'RUNNING'].includes(execution.status);
  const logs = execution.logs || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={execution.workflow?.name || 'Execução'}
        subtitle={`${TRIGGER_TYPE_LABEL[execution.trigger_type] || execution.trigger_type} · ${execution.duration_ms != null ? `durou ${execution.duration_ms} ms` : 'em andamento'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/automacao/execucoes')} disabled={acting}>
              Voltar
            </Button>
            {canRetry && cancellable && (
              <Button
                variant="danger"
                icon="close"
                title="O cancelamento é cooperativo: o passo em andamento termina e o fluxo para em seguida"
                disabled={acting}
                onClick={() => setConfirm('cancel')}
              >
                Cancelar execução
              </Button>
            )}
            {canRetry && (
              <Button
                variant="primary"
                icon="refresh"
                title="Cria uma execução nova com a mesma entrada e versão"
                disabled={acting}
                onClick={() => setConfirm('retry')}
              >
                Reexecutar
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusToTone(info.variant)}>{info.label}</Badge>
            {execution.dry_run && <Badge tone="info">simulação</Badge>}
            <Badge tone="neutral">v{execution.version}</Badge>
          </div>
          <DescriptionList
            items={[
              { key: 'Começou', value: formatDateTime(execution.started_at || execution.created_at) },
              { key: 'Durou', value: execution.duration_ms != null ? `${execution.duration_ms} ms` : 'ainda rodando' },
              { key: 'O que disparou', value: TRIGGER_TYPE_LABEL[execution.trigger_type] || execution.trigger_type },
              { key: 'Código de rastreio', value: (
                <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all' }}>
                  {execution.trace_id || '—'}
                </span>
              ) },
            ]}
          />
          {execution.error && (
            <p style={{
              fontSize: 13, margin: 0, padding: 12, borderRadius: 8,
              border: '1px solid var(--su-danger)', color: 'var(--su-danger-fg)',
              background: 'var(--su-danger-bg)',
            }}>
              {execution.error}
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PayloadCard title="O que entrou" value={execution.input} />
        <PayloadCard title="O que saiu de cada passo" value={execution.output} />
      </div>

      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            Passo a passo
          </h2>
          {!logs.length ? (
            <EmptyState
              icon="dashboard"
              title="Sem registro de passos"
              description="Ou a execução acabou de entrar na fila, ou o fluxo não gerou log."
            />
          ) : (
            <Timeline
              items={logs.map((log) => {
                const lvl = LOG_LEVEL[log.level];
                return {
                  active: log.level === 'error',
                  title: (
                    <span className="flex flex-wrap items-center gap-2">
                      {lvl && <Badge tone={lvl.tone}>{lvl.label}</Badge>}
                      {log.node_id && (
                        <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, color: 'var(--su-text-muted)' }}>
                          {log.node_id}
                        </span>
                      )}
                      <span>{log.message}</span>
                    </span>
                  ),
                  meta: [
                    log.duration_ms != null ? `${log.duration_ms} ms` : null,
                    formatDateTime(log.created_at),
                  ].filter(Boolean).join(' · '),
                };
              })}
            />
          )}
        </div>
      </Card>

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.executions.retry'). */}
      <ConfirmDialog
        open={!!confirm}
        danger={confirm === 'cancel'}
        loading={acting}
        title={confirm === 'cancel' ? 'Cancelar execução' : 'Reexecutar'}
        message={
          confirm === 'cancel'
            ? 'Cancelar esta execução? O cancelamento é cooperativo — o passo que está rodando agora termina, e o fluxo para em seguida. O que já aconteceu não volta atrás.'
            : 'Criar uma execução NOVA com a mesma entrada e a mesma versão do fluxo? O que ela fizer acontece de verdade. Esta execução continua no histórico.'
        }
        confirmLabel={confirm === 'cancel' ? 'Cancelar execução' : 'Reexecutar'}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function PayloadCard({ title, value }) {
  return (
    <Card>
      <div style={{ padding: 20 }} className="space-y-2">
        <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>{title}</h2>
        <pre
          style={{
            fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
            border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
            maxHeight: 260, overflow: 'auto', color: 'var(--su-text-secondary)',
          }}
        >
          {value == null ? '—' : JSON.stringify(value, null, 2)}
        </pre>
      </div>
    </Card>
  );
}
