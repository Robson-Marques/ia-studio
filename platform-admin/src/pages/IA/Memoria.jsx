import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, useToast } from '@studio-ux-ds/react';
import { listMemoryProfiles } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MEMORY_SCOPES } from './ia.constants';

// IA/Memoria — LISTAGEM no molde `ListScreen` do DS (v0.10.34). Antes era um
// `<div>` comum com PageHeader + DataTable: como não era `.su-screen`, a
// preferência de largura do Personalizar (Medida de leitura / Tela inteira) não
// alcançava esta tela. O ListScreen é o mesmo padrão que o AquaPark usa nas
// listas — traz a `.su-screen` e a toolbar padrão. Comportamento preservado:
// mesmas colunas, clique-na-linha abre as entradas do perfil, mesmo estado
// vazio; a busca por nome é client-side (a lista é curta) e dá à toolbar um
// propósito em vez de uma barra vazia.

export default function Memoria() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const canWrite = can('ai.memory.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listMemoryProfiles({ environment_id: environmentId || undefined });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopeLabel = (s) => (MEMORY_SCOPES.find((x) => x.value === s)?.label || s);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((p) => (p.name || '').toLowerCase().includes(term));
  }, [items, q]);

  const columns = [
    { key: 'name', header: 'Nome', render: (p) => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{p.name}</div>
        {p.description && (
          <div style={{ fontSize: 11, color: 'var(--su-text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.description}
          </div>
        )}
      </div>
    ) },
    { key: 'scope', header: 'Escopo', render: (p) => <Badge tone="info">{scopeLabel(p.scope)}</Badge> },
    { key: 'ttl', header: 'Validade', align: 'right', render: (p) => p.default_ttl_seconds != null ? `${p.default_ttl_seconds}s` : 'nunca expira' },
    { key: 'max', header: 'Máx. itens', align: 'right', render: (p) => p.max_items ?? 'ilimitado' },
  ];

  const newProfileBtn = canWrite ? (
    <Button variant="primary" icon="plus" onClick={() => navigate('/ia/memoria/perfis/nova')}>
      Novo perfil
    </Button>
  ) : null;

  return (
    <ListScreen
      title="Memória"
      subtitle="O que os assistentes lembram, por escopo (sessão / contato / fluxo / assistente), com validade e limite de itens."
      primaryAction={newProfileBtn}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Buscar perfil…"
      loading={loading}
      columns={columns}
      rows={rows}
      getRowId={(p) => p.id}
      onRowClick={(p) => navigate(`/ia/memoria/${p.id}`, { state: { profile: p } })}
      getRowLabel={(p) => `Abrir ${p.name}`}
      filterActive={!!q.trim()}
      emptyNew={{
        icon: 'settings',
        title: 'Nenhum perfil de memória',
        description: 'Crie perfis para o assistente lembrar contexto entre mensagens.',
        action: newProfileBtn,
      }}
      emptyFiltered={{
        title: 'Nenhum perfil encontrado',
        description: 'Nenhum perfil com esse nome. Ajuste a busca.',
        onClear: () => setQ(''),
      }}
    />
  );
}
