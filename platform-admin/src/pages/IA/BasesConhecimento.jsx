import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Button, useToast } from '@studio-ux-ds/react';
import { listKnowledgeBases } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from './ia.constants';

// IA/BasesConhecimento — LISTAGEM no molde `ListScreen` do DS (v0.10.34): a tela
// passa a ser `.su-screen`, então a preferência de largura do Personalizar vale
// aqui. Antes era <div> comum + DataTable. Mesmo padrão do AquaPark. Comportamento
// preservado: mesmas colunas, clique-na-linha abre a base, mesmo estado vazio.
// Busca por nome client-side dá propósito à toolbar do molde.

export default function BasesConhecimento() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const canWrite = can('ai.knowledge.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listKnowledgeBases();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((b) => (b.name || '').toLowerCase().includes(term));
  }, [items, q]);

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
    <ListScreen
      title="Conhecimento"
      subtitle="O que os assistentes consultam para responder — documentos indexados e pesquisáveis por significado."
      primaryAction={newBaseBtn}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Buscar base…"
      loading={loading}
      columns={columns}
      rows={rows}
      getRowId={(b) => b.id}
      onRowClick={(b) => navigate(`/ia/conhecimento/${b.id}`, { state: { base: b } })}
      getRowLabel={(b) => `Abrir ${b.name}`}
      filterActive={!!q.trim()}
      emptyNew={{
        icon: 'file',
        title: 'Nenhuma base neste ambiente',
        description: 'Crie uma base e adicione documentos para os assistentes consultarem.',
        action: newBaseBtn,
      }}
      emptyFiltered={{ title: 'Nenhuma base encontrada', description: 'Nenhuma base com esse nome.', onClear: () => setQ('') }}
    />
  );
}
