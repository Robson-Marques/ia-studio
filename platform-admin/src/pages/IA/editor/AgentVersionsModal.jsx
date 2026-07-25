import React, { useState } from 'react';
import {
  Modal, ConfirmDialog, Badge, Button, EmptyState, useToast,
} from '@studio-ux-ds/react';
import { publishAgent } from '../../../services/ai';
import { usePermissions } from '../../../hooks/usePermissions';
import { formatDateTime } from '../ia.constants';

// Histórico de versões do assistente (imutáveis — diretriz 3): publicar aponta a
// current_version; reverter repontar para uma versão anterior.
//
// Migrado pro DS na v0.9.90. **Segue Modal de propósito**: não tem campo nenhum
// (é lista + duas ações), então respeita a regra do Modal do DS (v1.2.12) — a
// regra é sobre `TextArea`/escrita reflexiva, não sobre overlay em si. Agora
// abre do cabeçalho do editor (`AgenteEditor`), não mais da linha da lista.
//
// O ConfirmDialog aqui é um overlay sobre overlay — tolerado porque o
// ConfirmDialog é confirmação de ação, não um segundo nível de formulário
// (é o mesmo arranjo que o legado já tinha e que o DS aceita para P13).
export default function AgentVersionsModal({ open, onClose, agent, versions, onPublished }) {
  const toast = useToast();
  const { can } = usePermissions();
  const [confirming, setConfirming] = useState(null); // { version, isRollback }
  const [publishing, setPublishing] = useState(false);

  async function confirmPublish() {
    setPublishing(true);
    try {
      await publishAgent(agent.id, confirming.version);
      toast.success(
        confirming.isRollback
          ? `Voltou para a v${confirming.version}.`
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
  const list = versions || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Versões do assistente"
      maxWidth={680}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      {!list.length ? (
        <EmptyState
          icon="file"
          title="Nenhuma versão salva ainda"
          description="Salve o assistente com “Salvar como nova versão” marcado para gerar a v1."
        />
      ) : (
        <div className="space-y-2">
          {list.map((v) => {
            const isActive = v.version === current && current > 0;
            const isRollback = v.version < current;
            return (
              <div
                key={v.id || v.version}
                className="flex flex-wrap items-center gap-2"
                style={{
                  border: `1px solid ${isActive ? 'var(--su-action)' : 'var(--su-border-default)'}`,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontWeight: 600, fontSize: 14, color: 'var(--su-text-primary)' }}>
                  v{v.version}
                </span>
                {isActive && <Badge tone="success">Em uso</Badge>}
                {v.published_at && !isActive && <Badge tone="neutral">Já foi publicada</Badge>}
                <span style={{ fontSize: 12, flex: 1, minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--su-text-muted)' }}>
                  {v.note || 'sem nota'} · {formatDateTime(v.created_at)}
                </span>
                {can('ai.agents.publish') && !isActive && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={isRollback ? 'arrow-left' : 'check'}
                    title={isRollback
                      ? 'Voltar a usar esta versão — nenhuma versão é apagada'
                      : 'Passar a atender com esta versão'}
                    onClick={() => setConfirming({ version: v.version, isRollback })}
                  >
                    {isRollback ? 'Voltar para esta' : 'Publicar'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirming}
        danger={confirming?.isRollback}
        loading={publishing}
        title={confirming?.isRollback ? 'Voltar para uma versão anterior' : 'Publicar versão'}
        message={
          confirming?.isRollback
            ? `Voltar a versão em uso para a v${confirming?.version}? Os atendimentos passam a usar essa versão a partir de agora. Nenhuma versão é apagada — você pode publicar a mais nova de novo depois.`
            : `Publicar a v${confirming?.version}? O assistente passa a atender usando essa versão.`
        }
        confirmLabel={confirming?.isRollback ? 'Voltar para esta versão' : 'Publicar'}
        onClose={() => setConfirming(null)}
        onConfirm={confirmPublish}
      />
    </Modal>
  );
}
