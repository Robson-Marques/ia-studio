import React, { useMemo, useState } from 'react';
import { Loader2, RotateCcw, Rocket } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { Badge } from '../../../components/ui/Table';
import { Select } from '../../../components/ui/FormField';
import { publishWorkflow } from '../../../services/automation';
import { usePermissions } from '../../../hooks/usePermissions';
import { toast } from '../../../lib/toast';
import { formatDateTime, TRIGGER_LABEL } from '../automation.constants';

// Histórico de versões (imutáveis — diretriz 3): publicar, rollback e diff
// textual entre duas versões (linhas +/- do JSON do grafo).
export default function VersionsModal({ open, onClose, workflow, versions, onPublished }) {
  const { can } = usePermissions();
  const [confirming, setConfirming] = useState(null); // { version, isRollback }
  const [publishing, setPublishing] = useState(false);
  const [diffA, setDiffA] = useState('');
  const [diffB, setDiffB] = useState('');

  const diff = useMemo(() => {
    if (!diffA || !diffB) return null;
    const va = versions.find((v) => String(v.version) === String(diffA));
    const vb = versions.find((v) => String(v.version) === String(diffB));
    if (!va || !vb) return null;
    const dump = (v) => JSON.stringify({ trigger: v.trigger, graph: v.graph }, null, 2).split('\n');
    return computeLineDiff(dump(va), dump(vb));
  }, [diffA, diffB, versions]);

  async function confirmPublish() {
    setPublishing(true);
    try {
      const result = await publishWorkflow(workflow.id, confirming.version);
      toast.success(confirming.isRollback ? `Fluxo revertido para a v${confirming.version}.` : `Versão v${confirming.version} publicada.`);
      (result.warnings || []).forEach((w) => toast.warn(w));
      setConfirming(null);
      onPublished();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Versões do fluxo" size="xl">
      <div className="space-y-4">
        <div className="space-y-2">
          {versions.map((v) => {
            const isActive = workflow.status === 'PUBLISHED' && v.version === workflow.current_version;
            const isRollback = v.version < workflow.current_version;
            return (
              <div
                key={v.id}
                className="rounded-lg p-3 flex flex-wrap items-center gap-2"
                style={{ border: `1px solid ${isActive ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}` }}
              >
                <span className="font-mono font-semibold text-sm" style={{ color: 'var(--ap-text-1)' }}>v{v.version}</span>
                {isActive && <Badge variant="green">Ativa</Badge>}
                {v.published_at && !isActive && <Badge variant="gray">Já publicada</Badge>}
                <Badge variant="purple">{TRIGGER_LABEL[(v.trigger || {}).type] || 'Manual'}</Badge>
                <span className="text-xs flex-1 min-w-[120px] truncate" style={{ color: 'var(--ap-text-4)' }}>
                  {v.note || 'sem nota'} · {formatDateTime(v.created_at)}
                </span>
                {can('automation.workflows.publish') && !isActive && (
                  <button
                    className="btn-secondary text-xs"
                    title={isRollback ? 'Reverter: tornar esta a versão ativa' : 'Publicar esta versão'}
                    onClick={() => setConfirming({ version: v.version, isRollback })}
                  >
                    {isRollback ? <RotateCcw size={13} /> : <Rocket size={13} />}
                    {isRollback ? 'Reverter' : 'Publicar'}
                  </button>
                )}
              </div>
            );
          })}
          {!versions.length && <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>Nenhuma versão salva ainda.</p>}
        </div>

        {versions.length >= 2 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>Comparar versões</p>
            <div className="flex items-center gap-2">
              <Select value={diffA} onChange={(e) => setDiffA(e.target.value)} className="max-w-[120px]">
                <option value="">de…</option>
                {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
              </Select>
              <Select value={diffB} onChange={(e) => setDiffB(e.target.value)} className="max-w-[120px]">
                <option value="">para…</option>
                {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
              </Select>
            </div>
            {diff && (
              <pre
                className="rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-72 overflow-y-auto"
                style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface-2)' }}
              >
                {diff.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.kind === 'add' ? '#22c55e' : line.kind === 'del' ? '#ef4444' : 'var(--ap-text-4)',
                    }}
                  >
                    {line.kind === 'add' ? '+ ' : line.kind === 'del' ? '- ' : '  '}{line.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirming}
        danger={confirming?.isRollback}
        loading={publishing}
        title={confirming?.isRollback ? 'Reverter versão' : 'Publicar versão'}
        message={
          confirming?.isRollback
            ? `Voltar a versão ativa do fluxo para a v${confirming?.version}? Os gatilhos passam a usar essa versão imediatamente. Nenhuma versão é apagada.`
            : `Publicar a v${confirming?.version}? O fluxo passa a disparar por gatilhos (evento/agendamento/webhook) usando essa versão.`
        }
        confirmLabel={confirming?.isRollback ? 'Aplicar rollback' : 'Publicar'}
        onClose={() => setConfirming(null)}
        onConfirm={confirmPublish}
      />
    </Modal>
  );
}

// Diff textual simples (LCS por linhas) — suficiente pra comparar versões.
function computeLineDiff(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > 400_000) {
    // Grafos gigantes: fallback sem LCS.
    return [
      ...a.map((text) => ({ kind: 'del', text })),
      ...b.map((text) => ({ kind: 'add', text })),
    ];
  }
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
    else { out.push({ kind: 'add', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ kind: 'del', text: a[i] }); i++; }
  while (j < m) { out.push({ kind: 'add', text: b[j] }); j++; }
  return out;
}
