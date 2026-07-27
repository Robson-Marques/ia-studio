import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, DataTable, Badge, Button, ConfirmDialog, EmptyState, useToast, Spinner } from '@studio-ux-ds/react';
import { listProfiles, deleteProfile } from '../services/profiles';
import { usePermissions } from '../hooks/usePermissions';

// Perfis de acesso — os conjuntos de permissão que se atribuem às pessoas.
// Migrada pro DS na v0.10.16.
//
// Decisões de composição:
//
//  · **O editor virou rota** (`/perfis/novo` e `/perfis/:id`). Era um Modal `lg`
//    com o catálogo INTEIRO de permissões dentro — dezenas de opções em grupos,
//    com rolagem dentro da rolagem. Compor um perfil é trabalho, não confirmação.
//  · **A linha abre o perfil**, inclusive os de sistema: eles abrem em leitura
//    (é útil ver o que o "Administrador" pode antes de copiar a ideia num perfil
//    próprio). O legado sinalizava isso com um cadeado no lugar do lápis, o que
//    fazia a mesma coluna significar duas coisas.
//  · **Excluir na barra de lote**, e só para perfis personalizados: perfil de
//    sistema não se apaga, então oferecer a ação seria prometer o que falha.

export default function PerfisAcesso() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [excluir, setExcluir] = useState(null); // { ids, clear }
  const [excluindo, setExcluindo] = useState(false);

  const podeEscrever = can('core.profiles.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listProfiles();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deSistema = (p) => Boolean(p.is_system || p.system);

  async function confirmarExclusao() {
    if (!excluir) return;
    const { ids, clear } = excluir;
    setExcluindo(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await deleteProfile(id); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setExcluindo(false);
    setExcluir(null);
    clear?.();
    if (ok) toast.success(ok === 1 ? 'Perfil excluído.' : `${ok} perfis excluídos.`);
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const novo = podeEscrever && (
    <Button variant="primary" icon="plus" onClick={() => navigate('/perfis/novo')}>Novo perfil</Button>
  );

  const columns = [
    { key: 'name', header: 'Perfil', render: (p) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{p.name}</p>
        {p.description && (
          <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">{p.description}</p>
        )}
      </div>
    ) },
    { key: 'perms', header: 'Permissões', align: 'right', render: (p) => (
      Array.isArray(p.permissions) ? p.permissions.length : '—'
    ) },
    { key: 'kind', header: 'Origem', render: (p) => (
      deSistema(p)
        ? <Badge tone="info">da plataforma</Badge>
        : <Badge tone="neutral">criado aqui</Badge>
    ) },
  ];

  // Perfil de sistema não se apaga — a plataforma o mantém.
  const bulkActions = (ids, clear) => {
    if (!podeEscrever) return null;
    const sel = items.filter((p) => ids.includes(p.id));
    if (!sel.length || sel.some(deSistema)) return null;
    return (
      <Button
        variant="ghost"
        icon="trash"
        title="Apaga o perfil — quem estiver nele precisa ser movido antes"
        onClick={() => setExcluir({ ids, clear })}
      >
        Excluir
      </Button>
    );
  };

  const varios = (excluir?.ids.length || 0) > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfis de acesso"
        subtitle="Cada perfil é um conjunto de permissões. Os que vêm da plataforma podem ser consultados, mas não alterados."
        actions={novo}
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon="lock"
            title="Nenhum perfil"
            description="Crie um perfil para poder dar acesso a alguém — ninguém entra no sistema sem estar em um."
            action={novo}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            Clique num perfil para ver ou mudar o que ele libera.
          </p>
          <DataTable
            columns={columns}
            rows={items}
            getRowId={(p) => p.id}
            onRowClick={(p) => navigate(`/perfis/${p.id}`)}
            getRowLabel={(p) => `Abrir o perfil ${p.name}`}
            bulkActions={bulkActions}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(excluir)}
        danger
        loading={excluindo}
        title="Excluir perfil"
        message={
          varios
            ? `Excluir os ${excluir.ids.length} perfis selecionados? Isso não tem como desfazer, e quem estiver em qualquer um deles precisa ser movido para outro perfil primeiro — senão a exclusão falha.`
            : 'Excluir este perfil? Isso não tem como desfazer, e quem estiver nele precisa ser movido para outro perfil primeiro — senão a exclusão falha.'
        }
        confirmLabel="Excluir"
        onClose={() => !excluindo && setExcluir(null)}
        onConfirm={confirmarExclusao}
      />
    </div>
  );
}
