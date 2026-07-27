import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { PageHeader, Card, DataTable, EmptyState, Badge, Field, Input, Button, useToast, Spinner } from '@studio-ux-ds/react';
import { getMemoryProfile, listMemoryEntries } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { MEMORY_SCOPES, formatDateTime } from './ia.constants';

// IA/MemoriaEntradas — entradas de um perfil de memória (somente leitura).
//
// Promovida a rota na v0.9.88. Antes era um master-detail por state (`selected`)
// com um botão "voltar" falso: a URL não mudava, F5 perdia o contexto e o botão
// de voltar do navegador saía da tela em vez de subir um nível. Agora é rota
// real (/ia/memoria/:id), que é o destino do clique na linha da lista.
//
// Escrita de entradas acontece pelos assistentes/habilidades, não pela UI —
// esta tela é de leitura, com o "Editar perfil" apontando pro editor.

export default function MemoriaEntradas() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { can } = usePermissions();

  const canWrite = can('ai.memory.write');

  const [profile, setProfile] = useState(location.state?.profile ?? null);
  const [loadingProfile, setLoadingProfile] = useState(!location.state?.profile);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scopeKey, setScopeKey] = useState('');

  useEffect(() => {
    if (profile) return;
    let alive = true;
    (async () => {
      setLoadingProfile(true);
      try {
        const p = await getMemoryProfile(id);
        if (alive) setProfile(p);
      } catch (err) {
        if (!alive) return;
        toast.error(err.message);
        navigate('/ia/memoria', { replace: true });
      } finally {
        if (alive) setLoadingProfile(false);
      }
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const { items } = await listMemoryEntries(id, { scope_key: scopeKey || undefined });
      setEntries(items);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'scope_key', header: 'Chave de escopo', render: (e) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{e.scope_key}</span>
    ) },
    { key: 'key', header: 'Chave' },
    { key: 'value', header: 'Valor', render: (e) => (
      <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, wordBreak: 'break-all', color: 'var(--su-text-muted)' }}>
        {typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}
      </span>
    ) },
    { key: 'expires_at', header: 'Expira', render: (e) => formatDateTime(e.expires_at) },
    { key: 'updated_at', header: 'Atualizado', render: (e) => formatDateTime(e.updated_at) },
  ];

  const scopeLabel = MEMORY_SCOPES.find((x) => x.value === profile?.scope)?.label || profile?.scope;

  if (loadingProfile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <Spinner size="lg" center />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile?.name || 'Perfil de memória'}
        subtitle="O que o assistente já lembra neste perfil (somente leitura — a escrita acontece durante o atendimento)."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/ia/memoria')}>
              Voltar
            </Button>
            {canWrite && (
              <Button variant="primary" icon="edit" onClick={() => navigate(`/ia/memoria/perfis/${id}/editar`)}>
                Editar perfil
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div style={{ padding: 20 }} className="flex flex-wrap items-end gap-3">
          {profile?.scope && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--su-text-muted)', margin: '0 0 4px' }}>Escopo</p>
              <Badge tone="info">{scopeLabel}</Badge>
            </div>
          )}
          <div style={{ minWidth: 240 }}>
            <Field label="Filtrar por chave de escopo">
              <Input
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                placeholder="ID do contato / da sessão…"
              />
            </Field>
          </div>
          <Button variant="secondary" icon="search" onClick={load} disabled={loading}>
            Filtrar
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : !entries.length ? (
        <Card>
          <EmptyState
            icon="settings"
            title="Sem entradas"
            description={scopeKey
              ? 'Nenhuma entrada para esse filtro. Limpe o filtro para ver tudo.'
              : 'Este perfil ainda não guardou nada — as entradas aparecem conforme os assistentes atendem.'}
          />
        </Card>
      ) : (
        <DataTable columns={columns} rows={entries} getRowId={(e) => e.id} />
      )}
    </div>
  );
}
