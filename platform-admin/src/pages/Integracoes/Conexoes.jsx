import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListScreen, Badge, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import {
  listConnections, changeConnectionState, testConnection, listConnectionProviders,
} from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { statusMeta, STATE_ACTIONS, prettifyProviderKey } from './integration.constants';

// Integrações/Conexões — as instâncias nomeadas dos conectores disponíveis.
// Migrada pro DS na v0.10.11.
//
// Decisões de composição:
//
//  · **A linha abre a conexão** (`/integracoes/conexoes/:id`). Era um Modal `lg`
//    com abas Dados/Logs; virou rota porque uma conexão é um registro que existe
//    por si — tem histórico, é destino de link de outras telas (a de Números do
//    WhatsApp manda "abrir a conexão deste número") e agora tem URL própria.
//    O `?open=<id>` que criei na v0.10.10 continua funcionando: vira redirect.
//  · **Seis ícones por linha viraram barra de lote.** A coluna de ações tinha
//    editar, testar, descobrir, ativar, desativar, manutenção e mais o botão do
//    Google — sete alvos de 14px empilhados na borda direita, cada um com risco
//    de clique trocado, e três deles apareciam/sumiam conforme o estado. Agora a
//    seleção diz o que é possível: **testar** vale para qualquer conjunto;
//    **ativar/desativar/manutenção** só aparecem quando a seleção INTEIRA aceita
//    aquela transição (senão a ação prometeria o que ia falhar em metade); e
//    **editar** e **entrar com Google** exigem uma conexão só, porque são sobre
//    um registro específico.
//  · **"Descobrir recursos" saiu da lista e virou aba na conexão.** É leitura
//    sobre uma conexão só, e o resultado (ids de setores, assuntos, números) é
//    para ser consultado e copiado com calma — não cabia num modal disparado da
//    linha e some ao fechar.
//  · Testar em lote é sequencial de propósito: cada teste abre conexão real com
//    o sistema do outro lado, e disparar tudo de uma vez é um jeito discreto de
//    fazer o próprio painel bater na porta do ERP alheio.

export default function Conexoes() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [stateAction, setStateAction] = useState(null); // { ids, action, clear }
  const [acting, setActing] = useState(false);
  const [providerNames, setProviderNames] = useState({});
  const [q, setQ] = useState('');

  const podeEscrever = can('integrations.connections.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listConnections();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // O nome amigável do conector vem do catálogo local; sem isto a coluna mostra a
    // chave crua do provider — linguagem de código na tela.
    listConnectionProviders()
      .then(({ items: list }) => setProviderNames(Object.fromEntries((list || []).map((p) => [p.key, p.name]))))
      .catch((err) => toast.error(err.message));
  }, []);

  // `?open=<id>` legado (v0.10.10, deep-link da tela de Números): agora que a
  // conexão tem rota própria, o parâmetro só encaminha. Mantido porque links
  // antigos e a tela de Números apontavam para cá.
  useEffect(() => {
    const alvo = searchParams.get('open');
    if (!alvo) return;
    setSearchParams({}, { replace: true });
    navigate(`/integracoes/conexoes/${alvo}`, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const providerName = (key) => providerNames[key] || prettifyProviderKey(key);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((c) =>
      (c.name || '').toLowerCase().includes(term) ||
      providerName(c.provider_key).toLowerCase().includes(term) ||
      (c.tags || []).some((t) => t.toLowerCase().includes(term)));
  }, [items, q, providerNames]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTest(ids, clear) {
    setTesting(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try {
        const { health } = await testConnection(id);
        if (health?.ok) ok += 1;
        else falhas.push(health?.detail || 'o teste não passou');
      } catch (err) {
        falhas.push(err.message);
      }
    }
    setTesting(false);
    clear();
    if (ok) toast.success(ok === 1 ? 'Conexão respondeu.' : `${ok} conexões responderam.`);
    if (falhas.length) toast.warn(`${falhas.length} não passaram: ${falhas[0]}`);
    load();
  }

  async function handleStateConfirm() {
    if (!stateAction) return;
    const { ids, action, clear } = stateAction;
    setActing(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try { await changeConnectionState(id, action); ok += 1; }
      catch (err) { falhas.push(err.message); }
    }
    setActing(false);
    setStateAction(null);
    clear?.();
    if (ok) toast.success(ok === 1 ? 'Estado da conexão atualizado.' : `${ok} conexões atualizadas.`);
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const novaConexao = podeEscrever && (
    <Button variant="primary" icon="plus" onClick={() => navigate('/integracoes/conexoes/nova')}>
      Nova conexão
    </Button>
  );

  const columns = [
    { key: 'name', header: 'Conexão', render: (c) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">{c.name}</p>
        <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }} className="truncate">
          {providerName(c.provider_key)}
        </p>
      </div>
    ) },
    { key: 'tags', header: 'Etiquetas', render: (c) => (
      (c.tags || []).length
        ? <div className="flex gap-1 flex-wrap">{c.tags.map((t) => <Badge key={t} tone="info">{t}</Badge>)}</div>
        : '—'
    ) },
    { key: 'status', header: 'Situação', render: (c) => {
      const meta = statusMeta(c.status);
      return (
        <div className="space-y-1">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {/* O detalhe do estado fica visível na célula: "por que está com erro"
              é a informação que o operador vem buscar, e informação essencial
              não mora em tooltip. */}
          {c.status_detail && (
            <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>{c.status_detail}</p>
          )}
        </div>
      );
    } },
    { key: 'health', header: 'Última verificação', render: (c) => (
      <div className="space-y-1">
        {c.last_health_ok === true && <Badge tone="success">respondeu</Badge>}
        {c.last_health_ok === false && <Badge tone="danger">não respondeu</Badge>}
        <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
          {c.last_health_at ? formatDateTime(c.last_health_at) : 'nunca testada'}
        </p>
      </div>
    ) },
  ];

  // A barra muda conforme a seleção: só oferece a transição que TODA a seleção
  // aceita, e reserva para uma conexão só o que é sobre um registro específico.
  const bulkActions = (ids, clear) => {
    const sel = items.filter((c) => ids.includes(c.id));
    if (!sel.length) return null;
    const uma = sel.length === 1 ? sel[0] : null;
    const todos = (fn) => sel.every(fn);

    const mudarEstado = (action) => setStateAction({ ids, action, clear });

    return (
      <>
        {podeEscrever && (
          <Button
            variant="ghost"
            icon="zap"
            loading={testing}
            title="Abre uma conexão real com o sistema do outro lado e conta o que voltou"
            onClick={() => handleTest(ids, clear)}
          >
            Testar
          </Button>
        )}
        {podeEscrever && uma && (
          <Button
            variant="ghost"
            icon="edit"
            title="Nome, etiquetas, prioridade e credenciais"
            onClick={() => navigate(`/integracoes/conexoes/${uma.id}/editar`)}
          >
            Editar
          </Button>
        )}
        {podeEscrever && todos((c) => c.status !== 'ACTIVE') && (
          <Button variant="ghost" icon="play" title={STATE_ACTIONS.enable.message} onClick={() => mudarEstado('enable')}>
            Ativar
          </Button>
        )}
        {podeEscrever && todos((c) => c.status !== 'DISABLED') && (
          <Button variant="ghost" icon="power" title={STATE_ACTIONS.disable.message} onClick={() => mudarEstado('disable')}>
            Desativar
          </Button>
        )}
        {podeEscrever && todos((c) => c.status !== 'MAINTENANCE') && (
          <Button variant="ghost" icon="settings" title={STATE_ACTIONS.maintenance.message} onClick={() => mudarEstado('maintenance')}>
            Pôr em manutenção
          </Button>
        )}
      </>
    );
  };

  const acao = stateAction ? STATE_ACTIONS[stateAction.action] : null;
  const varias = (stateAction?.ids.length || 0) > 1;

  return (
    <>
      <ListScreen
        title="Conexões"
        subtitle="Cada conexão é um acesso nomeado a um sistema de fora. Conexões nunca são excluídas — só mudam de estado, para o histórico não sumir junto."
        primaryAction={novaConexao}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Buscar conexão…"
        loading={loading && !items.length}
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        onRowClick={(c) => navigate(`/integracoes/conexoes/${c.id}`)}
        getRowLabel={(c) => `Abrir a conexão ${c.name}`}
        bulkActions={bulkActions}
        filterActive={!!q.trim()}
        emptyNew={{
          icon: 'zap',
          title: 'Nenhuma conexão ainda',
          description: 'Crie a primeira conexão e escolha o sistema que ela vai configurar.',
          action: novaConexao,
        }}
        emptyFiltered={{ title: 'Nenhuma conexão encontrada', description: 'Nenhuma conexão com esse nome, conector ou etiqueta.', onClear: () => setQ('') }}
      />

      {/* Os 5 patrasques: confirmação + a consequência escrita + tooltip no botão
          + loading + o gate de permissão que já esconde a ação. */}
      <ConfirmDialog
        open={Boolean(stateAction)}
        danger={acao?.danger}
        loading={acting}
        title={acao?.label || ''}
        message={
          acao
            ? varias
              ? `${acao.message} Isso vale para as ${stateAction.ids.length} conexões selecionadas.`
              : acao.message
            : ''
        }
        confirmLabel={acao?.label || 'Confirmar'}
        onClose={() => setStateAction(null)}
        onConfirm={handleStateConfirm}
      />
    </>
  );
}
