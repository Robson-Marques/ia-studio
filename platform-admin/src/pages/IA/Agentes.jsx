import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, EmptyState, Badge, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { listAgents, exportAgent, listAgentVersions } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDateTime } from './ia.constants';
import AgentVersionsModal from './editor/AgentVersionsModal';

// IA/Agentes — 6ª e última tela da família migrada pro DS (v0.9.90, 2026-07-24).
//
// A tela virou só LISTAGEM. Tudo que era Modal saiu:
//  · `AgentEditorModal` (8 abas, ~12 TextArea) → rotas /ia/agentes/nova e
//    /ia/agentes/:id (`AgenteEditor.jsx`).
//  · `ImportAgentModal` (TextArea de JSON) → rota /ia/agentes/importar.
//  · `AgentExecuteModal` (o ▶ da linha) → **absorvido** pela aba Testar do
//    editor. Eram duas UIs de teste no código; agora é uma.
//  · `AgentVersionsModal` → segue Modal (não tem campo), mas abre do cabeçalho
//    do editor, não da linha.
//
// A linha tinha 4 botões (▶ Testar, Versões, Exportar, ✎ Editar) **e** o nome
// clicável — cinco alvos disputando o mesmo clique. Pela regra do
// STUDIO_UX_TABLES.md §3, sobrou um: a linha inteira abre o assistente, e as
// três ações secundárias moraram no cabeçalho do editor, onde têm contexto.

export default function Agentes() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [versionsAgent, setVersionsAgent] = useState(null);
  const [versions, setVersions] = useState([]);

  const canWrite = can('ai.agents.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listAgents({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = (agentId) => items.find((a) => a.id === agentId);

  // Exporta N assistentes — um arquivo por assistente, em sequência. É a ação
  // que justifica a seleção múltipla aqui: baixar a configuração de cinco de uma
  // vez em vez de abrir cinco telas.
  async function handleExport(ids) {
    setExporting(true);
    let ok = 0;
    try {
      for (const agentId of ids) {
        const agent = byId(agentId);
        const data = await exportAgent(agentId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agente-${(agent?.name || 'export').toLowerCase().replace(/\s+/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        ok += 1;
      }
      toast.success(ok > 1
        ? `${ok} assistentes exportados (sem segredos).`
        : 'Assistente exportado (sem segredos).');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function openVersions(agentId) {
    try {
      const { items: vs } = await listAgentVersions(agentId);
      setVersions(vs);
      setVersionsAgent(byId(agentId) || null);
    } catch (err) { toast.error(err.message); }
  }

  const columns = [
    { key: 'name', header: 'Nome', render: (a) => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{a.name}</div>
        {a.description && (
          <div style={{ fontSize: 11, color: 'var(--su-text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.description}
          </div>
        )}
      </div>
    ) },
    { key: 'model', header: 'Modelo', render: (a) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{a.model}</span>
    ) },
    { key: 'version', header: 'Versão publicada', render: (a) => a.current_version > 0 ? `v${a.current_version}` : 'nenhuma ainda' },
    { key: 'status', header: 'Status', render: (a) => a.is_active === false
      ? <Badge tone="neutral">Inativo</Badge>
      : <Badge tone="success">Ativo</Badge>
    },
    { key: 'updated_at', header: 'Atualizado', render: (a) => formatDateTime(a.updated_at) },
  ];

  const newAgentBtn = canWrite ? (
    <Button variant="primary" icon="plus" onClick={() => navigate('/ia/agentes/nova')}>
      Novo assistente
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistentes"
        subtitle="Quem atende: personalidade, o que faz, o que sabe e o que pode fazer. Cada mudança vira uma versão."
        actions={
          <>
            {canWrite && (
              <Button
                variant="secondary"
                icon="arrow-up-right"
                title="Recriar um assistente a partir de um arquivo exportado"
                onClick={() => navigate('/ia/agentes/importar')}
              >
                Importar
              </Button>
            )}
            {newAgentBtn}
          </>
        }
      />

      {loading ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="user"
            title="Nenhum assistente neste ambiente"
            description="Crie um assistente e configure quem ele é, o que faz e o que pode fazer."
            action={newAgentBtn}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique num assistente para editar e testar. Marque as caixas para exportar vários de uma vez.
          </p>
          {/* Taxonomia de ações do DS (STUDIO_UX_TABLES.md §3):
              · abrir o assistente  → a linha inteira (onRowClick);
              · agir sobre 1+       → barra de lote (Exportar em massa);
              · só com 1 marcado    → Versões (não faz sentido em cinco).
              Testar não entra aqui: é sobre o assistente aberto, com o resultado
              na frente — vive na aba Testar do editor. */}
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(a) => a.id}
            onRowClick={(a) => navigate(`/ia/agentes/${a.id}`)}
            getRowLabel={(a) => `Abrir ${a.name}`}
            selectionMode="multiple"
            bulkActions={(ids, clear) => (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  loading={exporting}
                  title={ids.length > 1
                    ? `Baixar a configuração dos ${ids.length} assistentes (sem segredos)`
                    : 'Baixar a configuração deste assistente (sem segredos)'}
                  onClick={async () => { await handleExport(ids); clear(); }}
                >
                  {ids.length > 1 ? `Exportar ${ids.length}` : 'Exportar'}
                </Button>
                {ids.length === 1 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="refresh"
                    title="Histórico de versões — publicar ou voltar a uma anterior"
                    onClick={() => openVersions(ids[0])}
                  >
                    Versões
                  </Button>
                )}
              </>
            )}
          />
        </>
      )}

      <AgentVersionsModal
        open={!!versionsAgent}
        agent={versionsAgent}
        versions={versions}
        onClose={() => setVersionsAgent(null)}
        onPublished={() => { setVersionsAgent(null); load(); }}
      />
    </div>
  );
}
