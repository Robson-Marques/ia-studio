import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Button, useToast,
} from '@studio-ux-ds/react';
import { listKnowledgeBases } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDateTime } from './ia.constants';

// IA/BasesConhecimento — 5ª tela da família migrada pro DS (v0.9.89, 2026-07-24).
// Nasce alinhada às 2 regras endurecidas na v1.2.13 do DS:
//
//  1) STUDIO_UX_TABLES.md §3 — a linha é o alvo. O legado tinha `onClick` na
//     linha E um lixeira "Excluir base" na mesma linha (dois alvos disputando o
//     clique, e o destrutivo do lado do navegacional — pedindo clique errado).
//     Agora: a linha abre a base (/ia/conhecimento/:id) e o excluir vive LÁ,
//     onde o operador vê quantos documentos vai perder antes de confirmar.
//
//  2) Modal sem TextArea — o `CreateBaseModal` (Descrição) virou a rota
//     /ia/conhecimento/nova, e o `AddDocumentModal` (conteúdo de até 8 linhas,
//     markdown/texto colado) virou /ia/conhecimento/:id/documentos/novo.
//
// O master-detail por state (`selected` + botão voltar falso) foi promovido a
// rota real, igual foi feito na Memória na v0.9.88.
//
// Esta tela ficou sendo só LISTAGEM — sem nenhum overlay.

export default function BasesConhecimento() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const canWrite = can('ai.knowledge.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listKnowledgeBases({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'name', header: 'Nome', render: (b) => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{b.name}</div>
        {b.description && (
          <div style={{ fontSize: 11, color: 'var(--su-text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.description}
          </div>
        )}
      </div>
    ) },
    { key: 'documents', header: 'Documentos', align: 'right', render: (b) => b.document_count ?? b.documents?.length ?? 0 },
    { key: 'embedding_model', header: 'Modelo de indexação', render: (b) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{b.embedding_model}</span>
    ) },
    { key: 'updated_at', header: 'Atualizado', render: (b) => formatDateTime(b.updated_at) },
  ];

  const newBaseBtn = canWrite ? (
    <Button variant="primary" icon="plus" onClick={() => navigate('/ia/conhecimento/nova')}>
      Nova base
    </Button>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conhecimento"
        subtitle="O que os assistentes consultam para responder — documentos indexados e pesquisáveis por significado."
        actions={newBaseBtn}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="file"
            title="Nenhuma base neste ambiente"
            description="Crie uma base e adicione documentos para os assistentes consultarem."
            action={newBaseBtn}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique numa base para ver os documentos, testar uma consulta e ajustar o que ela contém.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(b) => b.id}
            onRowClick={(b) => navigate(`/ia/conhecimento/${b.id}`, { state: { base: b } })}
            getRowLabel={(b) => `Abrir ${b.name}`}
          />
        </>
      )}
    </div>
  );
}
