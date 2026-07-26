import React, { useMemo, useState } from 'react';
import {
  Modal, ConfirmDialog, Badge, Button, Select, EmptyState, useToast,
} from '@studio-ux-ds/react';
import { publishWorkflow } from '../../../services/automation';
import { usePermissions } from '../../../hooks/usePermissions';
import { formatDateTime, TRIGGER_LABEL } from '../automation.constants';

// Automação/editor/VersionsModal — histórico de versões: publicar, reverter e
// comparar duas versões. Migrado pro DS na v0.10.2.
//
// **Segue Modal, e isso está correto:** não tem campo de escrita nenhum — é
// leitura (a lista de versões, o diff) mais duas ações de confirmação. O `Select`
// do comparador é campo de resposta fechada, que o Modal aceita.
//
// As cores do diff eram `#22c55e` e `#ef4444` cravados; agora vêm do tema
// (`--su-success-fg` / `--su-danger-fg`), então funcionam no claro e no escuro.

export default function VersionsModal({ open, onClose, workflow, versions, onPublished }) {
  const toast = useToast();
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
      toast.success(
        confirming.isRollback
          ? `Fluxo voltou para a v${confirming.version}.`
          : `v${confirming.version} publicada.`,
      );
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
    <Modal open={open} onClose={onClose} title="Versões deste fluxo" maxWidth={860}>
      <div className="space-y-4">
        {!versions.length ? (
          <EmptyState
            icon="file"
            title="Nenhuma versão salva"
            description="Monte os passos e use Salvar versão — cada vez que salvar, nasce uma versão que fica guardada."
          />
        ) : (
          <div className="space-y-2">
            {versions.map((v) => {
              const isActive = workflow.status === 'PUBLISHED' && v.version === workflow.current_version;
              const isRollback = v.version < workflow.current_version;
              return (
                <div
                  key={v.id}
                  className="flex flex-wrap items-center gap-2"
                  style={{
                    borderRadius: 8, padding: 12,
                    border: `1px solid ${isActive ? 'var(--su-action)' : 'var(--su-border-default)'}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--su-font-mono, monospace)', fontWeight: 600, fontSize: 14,
                      color: 'var(--su-text-primary)',
                    }}
                  >
                    v{v.version}
                  </span>
                  {isActive && <Badge tone="success">No ar</Badge>}
                  {v.published_at && !isActive && <Badge tone="neutral">já esteve no ar</Badge>}
                  <Badge tone="info">{TRIGGER_LABEL[(v.trigger || {}).type] || 'Manual'}</Badge>
                  <span
                    className="text-xs truncate"
                    style={{ flex: 1, minWidth: 120, color: 'var(--su-text-muted)' }}
                  >
                    {v.note || 'sem anotação'} · {formatDateTime(v.created_at)}
                  </span>
                  {can('automation.workflows.publish') && !isActive && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={isRollback ? 'refresh' : 'send'}
                      title={
                        isRollback
                          ? 'Volta o fluxo para esta versão — os gatilhos passam a usar ela na hora'
                          : 'Põe esta versão no ar — os gatilhos passam a usar ela'
                      }
                      onClick={() => setConfirming({ version: v.version, isRollback })}
                    >
                      {isRollback ? 'Voltar para esta' : 'Pôr no ar'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {versions.length >= 2 && (
          <div className="space-y-2">
            <p
              style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em',
                margin: 0, color: 'var(--su-text-muted)',
              }}
            >
              Comparar duas versões
            </p>
            <div className="flex items-center gap-2">
              <div style={{ width: 130 }}>
                <Select value={diffA} onChange={(e) => setDiffA(e.target.value)} aria-label="Comparar de">
                  <option value="">de…</option>
                  {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
                </Select>
              </div>
              <div style={{ width: 130 }}>
                <Select value={diffB} onChange={(e) => setDiffB(e.target.value)} aria-label="Comparar para">
                  <option value="">para…</option>
                  {versions.map((v) => <option key={v.id} value={v.version}>v{v.version}</option>)}
                </Select>
              </div>
            </div>
            {diff && (
              <pre
                style={{
                  borderRadius: 8, padding: 12, margin: 0,
                  fontSize: 11, fontFamily: 'var(--su-font-mono, monospace)',
                  border: '1px solid var(--su-border-default)',
                  maxHeight: 288, overflow: 'auto',
                }}
              >
                {diff.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.kind === 'add'
                        ? 'var(--su-success-fg)'
                        : line.kind === 'del'
                          ? 'var(--su-danger-fg)'
                          : 'var(--su-text-muted)',
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

      {/* 5 patrasques: ConfirmDialog + a consequência escrita + tooltip no botão
          + loading + gate can('automation.workflows.publish'). */}
      <ConfirmDialog
        open={!!confirming}
        danger={confirming?.isRollback}
        loading={publishing}
        title={confirming?.isRollback ? 'Voltar para uma versão anterior' : 'Pôr esta versão no ar'}
        message={
          confirming?.isRollback
            ? `Voltar o fluxo para a v${confirming?.version}? A partir de agora os gatilhos passam a usar essa versão. Nenhuma versão é apagada — dá para vir e voltar.`
            : `Pôr a v${confirming?.version} no ar? O fluxo passa a disparar por gatilho (acontecimento, horário ou chamada externa) usando essa versão.`
        }
        confirmLabel={confirming?.isRollback ? 'Voltar para esta' : 'Pôr no ar'}
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
