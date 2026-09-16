import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, EmptyState, Badge, Modal, Field, Input, Select, Checkbox, Button, useToast } from '@studio-ux-ds/react';
import {
  listTools,
  listMcpServers, createMcpServer, syncMcpServer, getMcpServerTools,
} from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import { MCP_TRANSPORTS, formatDateTime } from './ia.constants';

// IA/Ferramentas — migração pro DS (v0.9.87, 2026-07-24).
// - Casca migrada: PageHeader + Tabs + Card + DataTable + EmptyState + Badge.
// - ToolModal EXTRAÍDO como rota dedicada em FerramentaEditor.jsx: o form
//   tinha TextArea de Descrição + TextArea de JSON schema (escrita reflexiva)
//   — anti-pattern documentado no DS (Modal com TextArea de descrição vai
//   pra tela dedicada). Botões da CatalogTab agora fazem navigate().
// - McpServerModal MANTIDO como Modal: form curto (nome, transporte,
//   endpoint, checkbox) sem escrita reflexiva.
// - Modal "Habilidades de <server>" MANTIDO: leitura curta, não é form.

// Abas viram SEGMENTS do ListScreen (padrão do AquaPark): a tela é `.su-screen`,
// então a preferência de largura do Personalizar passa a valer aqui.
const PAGE_SEGMENTS = [
  { id: 'catalog', label: 'Catálogo' },
  { id: 'mcp',     label: 'Servidores MCP' },
];
const PAGE_TITLE = 'Habilidades';
const PAGE_SUBTITLE = 'O que os assistentes podem fazer — habilidades da plataforma, personalizadas e importadas de servidores MCP.';

export default function Ferramentas() {
  const [tab, setTab] = useState('catalog');
  const seg = { segments: PAGE_SEGMENTS, segment: tab, onSegment: setTab };
  return tab === 'catalog' ? <CatalogTab seg={seg} /> : <McpTab seg={seg} />;
}

export function CatalogTab({ seg, title = PAGE_TITLE, subtitle = PAGE_SUBTITLE }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const canWrite = can('ai.tools.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listTools();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const columns = [
    {
      key: 'name',
      header: 'Nome',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 500, color: 'var(--su-text-primary)' }}>{t.name}</div>
          {t.description && (
            <div style={{ fontSize: 11, color: 'var(--su-text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'key',
      header: 'Identificador',
      render: (t) => (
        <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)' }}>{t.key}</span>
      ),
    },
    { key: 'category', header: 'Categoria', render: (t) => t.category || '—' },
    {
      key: 'origin',
      header: 'Origem',
      render: (t) => t.builtin
        ? <Badge tone="info">Da plataforma</Badge>
        : <Badge tone="warning">Personalizada</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => t.is_active === false
        ? <Badge tone="neutral">Desligada</Badge>
        : <Badge tone="success">Ativa</Badge>,
    },
    {
      key: 'requires_approval',
      header: 'Aprovação',
      render: (t) => t.requires_approval
        ? <Badge tone="warning">Exige</Badge>
        : <span style={{ fontSize: 12, color: 'var(--su-text-muted)' }}>não</span>,
    },
  ];

  return (
    <ListScreen
      title={title}
      subtitle={subtitle}
      {...seg}
      primaryAction={canWrite && (
        <Button variant="primary" icon="plus" onClick={() => navigate('/ia/ferramentas/tool/nova')}>
          Nova habilidade
        </Button>
      )}
      loading={loading}
      columns={columns}
      rows={items}
      getRowId={(t) => t.id || t.key}
      onRowClick={canWrite ? (t) => navigate(`/ia/ferramentas/tool/${t.id}/editar`, { state: { tool: t } }) : undefined}
      getRowLabel={(t) => t.builtin ? `Ajustes de ${t.name}` : `Editar ${t.name}`}
      emptyNew={{
        icon: 'settings',
        title: 'Nenhuma habilidade',
        description: 'As habilidades da plataforma já vêm instaladas — sincronize um servidor MCP para importar outras.',
      }}
    />
  );
}

export function McpTab({ seg, title = PAGE_TITLE, subtitle = PAGE_SUBTITLE }) {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [syncing, setSyncing] = useState(null);
  const [syncingMany, setSyncingMany] = useState(false);
  const [toolsServer, setToolsServer] = useState(null);
  const [tools, setTools] = useState([]);
  const canWrite = can('ai.mcp.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listMcpServers();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync(server) {
    setSyncing(server.id);
    try {
      const res = await syncMcpServer(server.id);
      const count = res?.discovered_tools?.length ?? res?.tools?.length ?? res?.count;
      toast.success(count != null ? `Sincronizado — ${count} habilidade(s).` : 'Servidor sincronizado.');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  }

  // Sincroniza N servidores em sequência. É a ação que justifica seleção
  // múltipla aqui: mandar buscar habilidades novas em todos de uma vez.
  async function handleSyncMany(ids) {
    setSyncingMany(true);
    let ok = 0;
    const falhas = [];
    try {
      for (const serverId of ids) {
        try {
          await syncMcpServer(serverId);
          ok += 1;
        } catch (err) {
          falhas.push(items.find((s) => s.id === serverId)?.name || serverId);
        }
      }
      if (ok) toast.success(ok > 1 ? `${ok} servidores sincronizados.` : 'Servidor sincronizado.');
      // Erro por servidor não some em silêncio — diz QUAIS falharam.
      if (falhas.length) toast.error(`Falhou em: ${falhas.join(', ')}.`);
      load();
    } finally {
      setSyncingMany(false);
    }
  }

  async function openTools(server) {
    try {
      const { items: list } = await getMcpServerTools(server.id);
      setTools(list);
      setToolsServer(server);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const columns = [
    { key: 'name', header: 'Nome', render: (s) => <span style={{ fontWeight: 500 }}>{s.name}</span> },
    { key: 'transport', header: 'Transporte', render: (s) => <Badge tone="neutral">{s.transport}</Badge> },
    {
      key: 'endpoint',
      header: 'Endpoint',
      render: (s) => (
        <span style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12, color: 'var(--su-text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
          {s.endpoint || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => s.is_active
        ? <Badge tone="success">Ativo</Badge>
        : <Badge tone="neutral">Inativo</Badge>,
    },
    { key: 'last_sync_at', header: 'Última sincronização', render: (s) => formatDateTime(s.last_sync_at) },
  ];

  return (
    <>
      <ListScreen
        title={title}
        subtitle={subtitle}
        {...seg}
        primaryAction={canWrite && (
          <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>
            Novo servidor
          </Button>
        )}
        loading={loading}
        columns={columns}
        rows={items}
        getRowId={(s) => s.id}
        onRowClick={(s) => openTools(s)}
        getRowLabel={(s) => `Ver habilidades de ${s.name}`}
        selectionMode="multiple"
        emptyNew={{
          icon: 'settings',
          title: 'Nenhum servidor MCP',
          description: 'Cadastre um servidor para importar habilidades externas.',
        }}
        bulkActions={canWrite ? (ids, clear) => (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              loading={syncingMany}
              title={ids.length > 1
                ? `Buscar habilidades novas nos ${ids.length} servidores`
                : 'Buscar habilidades novas neste servidor'}
              onClick={async () => { await handleSyncMany(ids); clear(); }}
            >
              {ids.length > 1 ? `Sincronizar ${ids.length}` : 'Sincronizar'}
            </Button>
            {ids.length === 1 && (
              <Button
                variant="secondary"
                size="sm"
                icon="search"
                title="Ver as habilidades que este servidor já trouxe"
                onClick={() => {
                  const server = items.find((s) => s.id === ids[0]);
                  if (server) openTools(server);
                }}
              >
                Ver habilidades
              </Button>
            )}
          </>
        ) : undefined}
      />

      <McpServerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { setCreateOpen(false); load(); }}
      />

      <Modal
        open={!!toolsServer}
        onClose={() => setToolsServer(null)}
        title={`Habilidades de ${toolsServer?.name ?? ''}`}
        maxWidth={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToolsServer(null)}>Fechar</Button>
            {canWrite && toolsServer && (
              <Button
                variant="primary"
                icon="refresh"
                loading={syncing === toolsServer.id}
                onClick={async () => {
                  await handleSync(toolsServer);
                  // Recarrega habilidades descobertas do servidor atual.
                  try {
                    const { items: list } = await getMcpServerTools(toolsServer.id);
                    setTools(list);
                  } catch (err) { toast.error(err.message); }
                }}
              >
                {syncing === toolsServer.id ? 'Sincronizando…' : 'Sincronizar'}
              </Button>
            )}
          </>
        }
      >
        {!tools.length ? (
          <EmptyState
            icon="settings"
            title="Nenhuma habilidade descoberta"
            description="Sincronize o servidor para descobrir as habilidades disponíveis."
          />
        ) : (
          <div className="space-y-2">
            {tools.map((t, i) => (
              <div
                key={t.name || i}
                style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12 }}
              >
                <div style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 13, fontWeight: 500, color: 'var(--su-text-primary)' }}>
                  {t.name}
                </div>
                {t.description && (
                  <div style={{ fontSize: 11, marginTop: 4, color: 'var(--su-text-muted)' }}>
                    {t.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function McpServerModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', transport: 'HTTP', endpoint: '', is_active: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: '', transport: 'HTTP', endpoint: '', is_active: false });
  }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Informe o nome.'); return; }
    setSaving(true);
    try {
      await createMcpServer({
        name: form.name.trim(),
        transport: form.transport,
        endpoint: form.endpoint.trim() || undefined,
        is_active: form.is_active,
      });
      toast.success('Servidor MCP cadastrado.');
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Novo servidor MCP"
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {saving ? 'Cadastrando…' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nome">
          <Input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Ex.: MCP de documentos"
          />
        </Field>
        <Field label="Transporte">
          <Select value={form.transport} onChange={(e) => patch({ transport: e.target.value })}>
            {MCP_TRANSPORTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Endpoint" hint="URL (HTTP/SSE) ou comando (STDIO).">
          <Input
            value={form.endpoint}
            onChange={(e) => patch({ endpoint: e.target.value })}
            placeholder="https://mcp.exemplo.com"
          />
        </Field>
        <Checkbox
          id="mcp-is-active"
          label="Ativar imediatamente"
          checked={form.is_active}
          onChange={(e) => patch({ is_active: e.target.checked })}
        />
      </div>
    </Modal>
  );
}
