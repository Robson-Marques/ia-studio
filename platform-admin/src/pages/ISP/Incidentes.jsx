import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, useToast } from '@studio-ux-ds/react';
import { listIncidents } from '../../services/isp';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { INCIDENT_STATUS, INCIDENT_MODE_LABEL } from './isp.constants';

// ISP/Incidentes — 1ª tela da família ISP migrada pro DS (v0.9.92).
//
// A tela virou só LISTAGEM. O legado tinha **cinco botões por linha** (Afetados,
// Editar, Disparar, Ativar, Encerrar), com visibilidade variando por status e
// por permissão — o pior caso de coluna de ações do sistema. Pela taxonomia do
// DS (STUDIO_UX_TABLES.md §3) a linha inteira abre o incidente e todas as ações
// vivem lá, onde o operador vê o escopo, o modo e quantos serão afetados.
//
// **Sem barra de lote, de propósito.** Ativar um incidente proativo DISPARA
// WhatsApp em massa; encerrar pode disparar o aviso de normalização. É o caso
// exato que a regra do DS cita como o que não se faz em lote — a decisão exige
// ler o incidente. Por isso a tabela não tem nem coluna de seleção.

export default function Incidentes() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { workspaceId, environmentId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const canWrite = can('isp.incidents.write');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) => (it.title || '').toLowerCase().includes(term));
  }, [items, q]);

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listIncidents({
        workspace_id: workspaceId || undefined,
        environment_id: environmentId || undefined,
      });
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId, environmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'title', header: 'Título', render: (it) => (
      <div>
        <div style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{it.title}</div>
        {it.forecast && (
          <div style={{ fontSize: 11, color: 'var(--su-text-muted)' }}>Previsão: {it.forecast}</div>
        )}
      </div>
    ) },
    { key: 'comm_mode', header: 'Comunicação', render: (it) => (
      <Badge tone={it.comm_mode === 'REACTIVE' ? 'neutral' : 'warning'}>
        {INCIDENT_MODE_LABEL[it.comm_mode] || it.comm_mode}
      </Badge>
    ) },
    { key: 'targets', header: 'Afetados', align: 'right', render: (it) => it._count?.targets ?? 0 },
    { key: 'status', header: 'Situação', render: (it) => {
      const st = INCIDENT_STATUS[it.status] || INCIDENT_STATUS.DRAFT;
      return <Badge tone={st.tone}>{st.label}</Badge>;
    } },
  ];

  const newBtn = canWrite ? (
    <Button variant="primary" icon="plus" onClick={() => navigate('/isp/incidentes/novo')}>
      Novo incidente
    </Button>
  ) : null;

  return (
    <ListScreen
      title="Incidentes e Manutenções"
      subtitle="Informativo de rede. No modo reativo o assistente informa quem procurar; no proativo o aviso é disparado em massa (com confirmação)."
      primaryAction={newBtn}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Buscar incidente…"
      loading={loading}
      columns={columns}
      rows={rows}
      getRowId={(it) => it.id}
      onRowClick={(it) => navigate(`/isp/incidentes/${it.id}`)}
      getRowLabel={(it) => `Abrir ${it.title}`}
      filterActive={!!q.trim()}
      emptyNew={{
        icon: 'alert-circle',
        title: 'Nenhum incidente',
        description: 'Crie um incidente para informar os clientes sobre manutenções ou quedas.',
        action: newBtn,
      }}
      emptyFiltered={{ title: 'Nenhum incidente encontrado', description: 'Nenhum incidente com esse título.', onClear: () => setQ('') }}
    />
  );
}
