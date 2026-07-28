import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { DetailScreen, Card, DescriptionList, Badge, Field, TextArea, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import { listApprovals, decideApproval } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { APPROVAL_STATUS, formatDateTime, friendlyTarget } from './ia.constants';
import { statusToTone } from '../../lib/tone';

// IA/AprovacaoDetalhe — página de decisão de uma pendência (v0.9.88).
//
// Promovida a rota porque:
//  1) a linha da tabela agora é clicável e abre o detalhe (regra do DS
//     STUDIO_UX_TABLES.md §3 — a linha é o alvo, sem botão redundante);
//  2) rejeitar exige um TextArea de motivo, e a regra do Modal (v1.2.11+ do DS)
//     proíbe TextArea em overlay — o RejectModal foi absorvido aqui, inline.
//
// Rota: /ia/aprovacoes/:id
//
// Carrega via `location.state.approval` (navegação da fila) ou, em refresh /
// deep-link, cai em `listApprovals + filter` (não há GET /ai/approvals/:id).

export default function AprovacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();

  const canDecide = can('ai.approvals.decide');

  const [approval, setApproval] = useState(location.state?.approval ?? null);
  const [loading, setLoading] = useState(!location.state?.approval);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (approval) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { items } = await listApprovals({ environment_id: environmentId || undefined });
        const found = items.find((a) => a.id === id);
        if (!alive) return;
        if (!found) {
          toast.error('Pendência não encontrada — talvez já tenha sido decidida.');
          navigate('/ia/aprovacoes', { replace: true });
          return;
        }
        setApproval(found);
      } catch (err) {
        if (alive) toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    setDeciding(true);
    try {
      await decideApproval(approval.id, { approve: true });
      toast.success('Ação aprovada — o assistente retoma o atendimento.');
      navigate('/ia/aprovacoes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeciding(false);
      setConfirmApprove(false);
    }
  }

  async function handleReject() {
    setDeciding(true);
    try {
      await decideApproval(approval.id, { approve: false, reject_reason: reason.trim() || undefined });
      toast.success('Ação rejeitada — o atendimento do assistente foi encerrado.');
      navigate('/ia/aprovacoes');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeciding(false);
    }
  }

  // O breadcrumb vive na TopBar do AppShell, alimentado pelo mapa BREADCRUMBS do
  // Layout. Havia aqui um `breadcrumb={breadcrumb}` no `PageHeader` — prop que o
  // DS não tem, apontando para uma variável que **não existia**: a tela quebrava
  // com `ReferenceError` ao abrir, logo abaixo de um comentário dizendo que essa
  // prop não existe. Prop morta que virou erro de verdade porque o valor também
  // era fantasma; o "voltar" garantido é o do molde.

  if (!approval) return null;

  const st = APPROVAL_STATUS[approval.status] || { label: approval.status, variant: 'gray' };
  const isPending = approval.status === 'PENDING';

  // Contexto: se for objeto plano, vira pares chave/valor legíveis; senão, JSON.
  const contextRows = (() => {
    const ctx = approval.context;
    if (!ctx || typeof ctx !== 'object') return [];
    return Object.entries(ctx).map(([k, v]) => ({
      key: k,
      value: typeof v === 'object' && v !== null
        ? <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}>{JSON.stringify(v)}</span>
        : String(v),
    }));
  })();

  return (
    <>
      <DetailScreen
        back={{ label: 'Voltar para a fila', onClick: () => navigate('/ia/aprovacoes') }}
        title={friendlyTarget(approval.target)}
        subtitle="Revise o que o assistente quer fazer antes de liberar a execução."
        loading={loading}
        /* `bare`: são vários cartões (o pedido, o contexto, a decisão). */
        bare
      >
        <Card>
          <div style={{ padding: 20 }} className="space-y-4">
            <DescriptionList
              items={[
                { key: 'Ação', value: friendlyTarget(approval.target) },
                { key: 'Status', value: <Badge tone={statusToTone(st.variant)}>{st.label}</Badge> },
                { key: 'Solicitada em', value: formatDateTime(approval.created_at) },
                ...(approval.agent_name ? [{ key: 'Assistente', value: approval.agent_name }] : []),
              ]}
            />
          </div>
        </Card>

        {contextRows.length > 0 && (
          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                O que o assistente vai fazer
              </h2>
              <DescriptionList items={contextRows} />
            </div>
          </Card>
        )}

        {!isPending && (
          <Card>
            <div style={{ padding: 20, fontSize: 14, color: 'var(--su-text-secondary)' }}>
              Esta pendência já foi decidida — não há mais ação a tomar.
            </div>
          </Card>
        )}

        {isPending && canDecide && (
          <Card>
            <div style={{ padding: 20 }} className="space-y-4">
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Sua decisão
              </h2>
              <p style={{ fontSize: 14, color: 'var(--su-text-secondary)', margin: 0 }}>
                <strong>Aprovar</strong> executa a ação de verdade e o assistente prossegue o atendimento.
                {' '}<strong>Rejeitar</strong> não altera nada no sistema — só recusa a execução e encerra o atendimento.
              </p>

              <Field
                label="Motivo da rejeição (opcional)"
                hint="Fica registrado no histórico. Só é usado se você rejeitar."
              >
                <TextArea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: destinatários incorretos"
                />
              </Field>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  icon="check"
                  title="Aprovar a ação — o assistente prossegue"
                  disabled={deciding}
                  onClick={() => setConfirmApprove(true)}
                >
                  Aprovar e executar
                </Button>
                <Button
                  variant="danger"
                  icon="close"
                  title="Rejeitar a ação — a execução é encerrada"
                  loading={deciding}
                  onClick={handleReject}
                >
                  {deciding ? 'Processando…' : 'Rejeitar'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {isPending && !canDecide && (
          <Card>
            <div style={{ padding: 20, fontSize: 14, color: 'var(--su-text-secondary)' }}>
              Você pode ver esta pendência, mas não tem permissão para decidir.
            </div>
          </Card>
        )}

        {/* 5 patrasques: ConfirmDialog + disclaimer + tooltip nos botões + loading + gate can(). */}
      </DetailScreen>

      <ConfirmDialog
        open={confirmApprove}
        loading={deciding}
        title="Aprovar ação"
        message={`Aprovar a execução de "${friendlyTarget(approval.target)}"? A ação será executada de verdade e o assistente prossegue. Verifique o contexto antes de confirmar.`}
        confirmLabel="Aprovar e executar"
        onClose={() => setConfirmApprove(false)}
        onConfirm={handleApprove}
      />
    </>
  );
}
