import React, { useState } from 'react';
import { RotateCcw, Rocket } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { Badge } from '../../../components/ui/Table';
import { publishAgent } from '../../../services/ai';
import { usePermissions } from '../../../hooks/usePermissions';
import { toast } from '../../../lib/toast';
import { formatDateTime } from '../ia.constants';

// Histórico de versões do agente (imutáveis — diretriz 3): publicar aponta a
// current_version; rollback repontar para versão anterior. Mesmo padrão do
// VersionsModal de Automação (Fase 4).
export default function AgentVersionsModal({ open, onClose, agent, versions, onPublished }) {
  const { can } = usePermissions();
  const [confirming, setConfirming] = useState(null); // { version, isRollback }
  const [publishing, setPublishing] = useState(false);

  async function confirmPublish() {
    setPublishing(true);
    try {
      await publishAgent(agent.id, confirming.version);
      toast.success(
        confirming.isRollback
          ? `Rollback para v${confirming.version} aplicado.`
          : `Versão v${confirming.version} publicada.`,
      );
      setConfirming(null);
      onPublished();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPublishing(false);
    }
  }

  const current = agent?.current_version ?? 0;

  return (
    <Modal open={open} onClose={onClose} title="Versões do agente" size="lg">
      <div className="space-y-2">
        {(versions || []).map((v) => {
          const isActive = v.version === current && current > 0;
          const isRollback = v.version < current;
          return (
            <div
              key={v.id || v.version}
              className="rounded-lg p-3 flex flex-wrap items-center gap-2"
              style={{ border: `1px solid ${isActive ? 'var(--ap-accent, #6366f1)' : 'var(--ap-border)'}` }}
            >
              <span className="font-mono font-semibold text-sm" style={{ color: 'var(--ap-text-1)' }}>v{v.version}</span>
              {isActive && <Badge variant="green">Ativa</Badge>}
              {v.published_at && !isActive && <Badge variant="gray">Já publicada</Badge>}
              <span className="text-xs flex-1 min-w-[120px] truncate" style={{ color: 'var(--ap-text-4)' }}>
                {v.note || 'sem nota'} · {formatDateTime(v.created_at)}
              </span>
              {can('ai.agents.publish') && !isActive && (
                <button
                  className="btn-secondary text-xs"
                  title={isRollback ? 'Rollback: repontar a versão ativa pra esta' : 'Publicar esta versão'}
                  onClick={() => setConfirming({ version: v.version, isRollback })}
                >
                  {isRollback ? <RotateCcw size={13} /> : <Rocket size={13} />}
                  {isRollback ? 'Rollback' : 'Publicar'}
                </button>
              )}
            </div>
          );
        })}
        {!(versions || []).length && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Nenhuma versão salva ainda. Salve as configurações do agente para gerar a v1.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!confirming}
        danger={confirming?.isRollback}
        loading={publishing}
        title={confirming?.isRollback ? 'Rollback de versão' : 'Publicar versão'}
        message={
          confirming?.isRollback
            ? `Repontar a versão ativa do agente para v${confirming?.version}? As execuções passam a usar essa versão. Nenhuma versão é apagada.`
            : `Publicar a v${confirming?.version}? O agente passa a executar usando essa versão.`
        }
        confirmLabel={confirming?.isRollback ? 'Aplicar rollback' : 'Publicar'}
        onClose={() => setConfirming(null)}
        onConfirm={confirmPublish}
      />
    </Modal>
  );
}
