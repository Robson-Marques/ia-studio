import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, useToast } from '@studio-ux-ds/react';
import { listAgents, exportAgent, listAgentVersions } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatDateTime } from './ia.constants';
import AgentVersionsModal from './editor/AgentVersionsModal';

// IA/Agentes — LISTAGEM no molde `ListScreen` do DS (v0.10.34): a tela passa a
// ser `.su-screen`, então a preferência de largura do Personalizar vale aqui.
// Antes era <div> comum + DataTable. Mesmo padrão do AquaPark. Comportamento
// preservado: a linha abre o assistente; a barra de lote exporta N e, com 1
// marcado, abre Versões; o modal de versões segue igual. Busca por nome dá
// propósito à toolbar do molde.

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
  const [q, setQ] = useState('');

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

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((a) => (a.name || '').toLowerCase().includes(term));
  }, [items, q]);

  // Exporta N assistentes — um arquivo por assistente, em sequência.
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

  const importBtn = canWrite ? (
    <Button
      variant="secondary"
      icon="arrow-up-right"
      title="Recriar um assistente a partir de um arquivo exportado"
      onClick={() => navigate('/ia/agentes/importar')}
    >
      Importar
    </Button>
  ) : null;

  return (
    <>
      <ListScreen
        title="Assistentes"
        subtitle="Quem atende: personalidade, o que faz, o que sabe e o que pode fazer. Cada mudança vira uma versão."
        primaryAction={<>{importBtn}{newAgentBtn}</>}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Buscar assistente…"
        loading={loading}
        columns={columns}
        rows={rows}
        getRowId={(a) => a.id}
        onRowClick={(a) => navigate(`/ia/agentes/${a.id}`)}
        getRowLabel={(a) => `Abrir ${a.name}`}
        selectionMode="multiple"
        filterActive={!!q.trim()}
        emptyNew={{
          icon: 'user',
          title: 'Nenhum assistente neste ambiente',
          description: 'Crie um assistente e configure quem ele é, o que faz e o que pode fazer.',
          action: newAgentBtn,
        }}
        emptyFiltered={{ title: 'Nenhum assistente encontrado', description: 'Nenhum assistente com esse nome.', onClear: () => setQ('') }}
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

      <AgentVersionsModal
        open={!!versionsAgent}
        agent={versionsAgent}
        versions={versions}
        onClose={() => setVersionsAgent(null)}
        onPublished={() => { setVersionsAgent(null); load(); }}
      />
    </>
  );
}
