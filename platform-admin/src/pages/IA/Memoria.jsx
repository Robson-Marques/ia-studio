import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, DataTable, EmptyState, Badge, Button, useToast,
} from '@studio-ux-ds/react';
import { listMemoryProfiles } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { MEMORY_SCOPES } from './ia.constants';

// IA/Memoria — migrada pro DS na v0.9.85; padronizada na v0.9.88.
//
// v0.9.88 aplicou 2 regras do DS retroativamente:
//  1) STUDIO_UX_TABLES.md §3 — a linha é o alvo. O lápis "Editar perfil" saiu
//     da linha (competia com o clique da linha); clicar na linha abre as
//     entradas do perfil (/ia/memoria/:id), e o "Editar perfil" vive lá.
//  2) Modal sem TextArea (v1.2.11+ do DS) — o `ProfileModal` (Descrição) virou
//     as rotas /ia/memoria/perfis/nova e /ia/memoria/perfis/:id/editar.
//
// O master-detail por state (`selected` + botão "voltar" falso) foi promovido a
// rota real (MemoriaEntradas.jsx) — a URL agora reflete onde o usuário está, e
// F5 / voltar do navegador funcionam.
//
// Esta tela ficou sendo só LISTAGEM — sem nenhum overlay.

export default function Memoria() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const columns = [
    { key: 'name', header: 'Nome', render: (p) => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--su-text)' }}>{p.name}</div>
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
    <div className="space-y-6">
      <PageHeader
        title="Memória"
        subtitle="O que os assistentes lembram, por escopo (sessão / contato / fluxo / assistente), com validade e limite de itens."
        actions={newProfileBtn}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="settings"
            title="Nenhum perfil de memória"
            description="Crie perfis para o assistente lembrar contexto entre mensagens."
            action={newProfileBtn}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique num perfil para ver o que ele já guardou e ajustar as regras.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(p) => p.id}
            onRowClick={(p) => navigate(`/ia/memoria/${p.id}`, { state: { profile: p } })}
            getRowLabel={(p) => `Abrir ${p.name}`}
          />
        </>
      )}
    </div>
  );
}
