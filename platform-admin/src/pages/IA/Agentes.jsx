import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Button, useToast,
} from '@studio-ux-ds/react';
import { listAgents } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDateTime } from './ia.constants';

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
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
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
            Clique num assistente para editar, testar, ver as versões ou exportar.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(a) => a.id}
            onRowClick={(a) => navigate(`/ia/agentes/${a.id}`)}
            getRowLabel={(a) => `Abrir ${a.name}`}
          />
        </>
      )}
    </div>
  );
}
