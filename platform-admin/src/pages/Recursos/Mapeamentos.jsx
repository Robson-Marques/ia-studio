import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListScreen, Badge, Button, ConfirmDialog, useToast } from '@studio-ux-ds/react';
import {
  getResourceCatalog, listMappings, updateMapping, deleteMapping,
} from '../../services/resource';
import { listConnections } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';

// Recursos/Mapeamentos — a tradução entre a resposta de um sistema de fora e os
// tipos que a plataforma entende. Migrada pro DS na v0.10.13.
//
// Decisões de composição:
//
//  · **O editor virou rota** (`/recursos/mapeamentos/novo` e `/:id`). Era um
//    Modal `xl` com dois `TextArea` (descrição e parâmetros de amostra em JSON),
//    a sugestão da IA e o editor de campos — a regra do Modal proíbe isso desde
//    o DS v1.2.12, e aqui o motivo salta: é a tela onde se trabalha, não onde se
//    confirma. O legado nem cabia no modal: o editor de campos rolava dentro de
//    um contêiner que já rolava.
//  · **A linha abre o mapeamento**; a barra de lote só oferece a transição que
//    TODA a seleção aceita (ativar OU desativar, nunca as duas juntas).
//  · **Excluir aceita vários**; editar exige um. Excluir mapeamento é destrutivo
//    de verdade — o que dependia dele para de traduzir — então continua com
//    confirmação escrevendo a consequência.

export default function Mapeamentos() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [items, setItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acao, setAcao] = useState(null); // { tipo: 'ativar'|'desativar'|'excluir', ids, clear }
  const [agindo, setAgindo] = useState(false);
  const [q, setQ] = useState('');

  const podeEscrever = can('resource.mappings.write');

  async function load() {
    setLoading(true);
    try {
      const [{ items: maps }, { items: cat }, { items: conns }] = await Promise.all([
        listMappings(),
        getResourceCatalog(),
        listConnections(),
      ]);
      setItems(maps);
      setCatalog(cat);
      setConnections(conns);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connName = useMemo(() => {
    const map = new Map(connections.map((c) => [c.id, c.name]));
    return (id) => (id ? (map.get(id) || id) : '—');
  }, [connections]);

  const typeLabel = useMemo(() => {
    const map = new Map(catalog.map((t) => [t.type, t.label]));
    return (type) => map.get(type) || type;
  }, [catalog]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((m) =>
      typeLabel(m.resource_type).toLowerCase().includes(term) ||
      (m.resource_type || '').toLowerCase().includes(term) ||
      connName(m.connection_id).toLowerCase().includes(term) ||
      (m.source_operation || '').toLowerCase().includes(term));
  }, [items, q, typeLabel, connName]);

  async function confirmar() {
    if (!acao) return;
    const { tipo, ids, clear } = acao;
    setAgindo(true);
    let ok = 0;
    const falhas = [];
    for (const id of ids) {
      try {
        if (tipo === 'excluir') await deleteMapping(id);
        else await updateMapping(id, { is_active: tipo === 'ativar' });
        ok += 1;
      } catch (err) {
        falhas.push(err.message);
      }
    }
    setAgindo(false);
    setAcao(null);
    clear?.();
    if (ok) {
      const verbo = tipo === 'excluir' ? 'excluído' : tipo === 'ativar' ? 'ativado' : 'desativado';
      toast.success(ok === 1 ? `Mapeamento ${verbo}.` : `${ok} mapeamentos ${verbo}s.`);
    }
    if (falhas.length) toast.error(`${falhas.length} não deram: ${falhas[0]}`);
    load();
  }

  const novo = podeEscrever && (
    <Button variant="primary" icon="plus" onClick={() => navigate('/recursos/mapeamentos/novo')}>
      Novo mapeamento
    </Button>
  );

  const columns = [
    { key: 'type', header: 'Traduz para', render: (m) => (
      <div className="min-w-0">
        <p style={{ fontWeight: 500, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
          {typeLabel(m.resource_type)}
        </p>
        <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)', fontFamily: 'var(--su-font-mono, monospace)' }}>
          {m.resource_type}
        </p>
      </div>
    ) },
    { key: 'origem', header: 'De onde vem', render: (m) => (
      <div className="min-w-0">
        <p style={{ margin: 0, color: 'var(--su-text-secondary)' }} className="truncate">{connName(m.connection_id)}</p>
        <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)', fontFamily: 'var(--su-font-mono, monospace)' }}>
          {m.source_operation}
        </p>
      </div>
    ) },
    { key: 'campos', header: 'Campos', align: 'right', render: (m) => Object.keys(m.field_map || {}).length },
    { key: 'status', header: 'Situação', render: (m) => (
      m.is_active
        ? <Badge tone="success">em uso</Badge>
        : <Badge tone="neutral">inativo</Badge>
    ) },
  ];

  const bulkActions = (ids, clear) => {
    if (!podeEscrever) return null;
    const sel = items.filter((m) => ids.includes(m.id));
    if (!sel.length) return null;
    const uma = sel.length === 1 ? sel[0] : null;
    return (
      <>
        {uma && (
          <Button variant="ghost" icon="edit" onClick={() => navigate(`/recursos/mapeamentos/${uma.id}`)}>
            Editar
          </Button>
        )}
        {sel.every((m) => !m.is_active) && (
          <Button
            variant="ghost"
            icon="play"
            title="Passa a valer: quem consultar este tipo de recurso nesta conexão recebe os dados traduzidos"
            onClick={() => setAcao({ tipo: 'ativar', ids, clear })}
          >
            Ativar
          </Button>
        )}
        {sel.every((m) => m.is_active) && (
          <Button
            variant="ghost"
            icon="power"
            title="Para de valer — quem depende desta tradução deixa de receber os dados"
            onClick={() => setAcao({ tipo: 'desativar', ids, clear })}
          >
            Desativar
          </Button>
        )}
        <Button
          variant="ghost"
          icon="trash"
          title="Apaga o mapeamento — não tem como desfazer"
          onClick={() => setAcao({ tipo: 'excluir', ids, clear })}
        >
          Excluir
        </Button>
      </>
    );
  };

  const MENSAGEM = {
    ativar: 'Ativar? A tradução passa a valer imediatamente — fluxos e assistentes que consultam este tipo de recurso começam a receber os dados no formato canônico.',
    desativar: 'Desativar? A tradução para de valer, e quem depende dela deixa de receber os dados traduzidos. O mapeamento fica guardado — dá para ativar de novo.',
    excluir: 'Excluir? Isto **não** tem como desfazer, e o que dependia desta tradução deixa de funcionar. Se a ideia é só parar de usar por enquanto, desative em vez de excluir.',
  };

  return (
    <>
      <ListScreen
        title="Mapeamentos"
        subtitle="Ensinam a plataforma a ler a resposta de cada sistema de fora. Nascem inativos de propósito — revise o que a IA sugeriu antes de pôr em uso."
        primaryAction={novo}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Buscar mapeamento…"
        loading={loading && !items.length}
        columns={columns}
        rows={rows}
        getRowId={(m) => m.id}
        onRowClick={(m) => navigate(`/recursos/mapeamentos/${m.id}`)}
        getRowLabel={(m) => `Abrir o mapeamento de ${typeLabel(m.resource_type)}`}
        bulkActions={bulkActions}
        filterActive={!!q.trim()}
        emptyNew={{
          icon: 'dashboard',
          title: 'Nenhum mapeamento',
          description: 'Um mapeamento diz de onde vem cada campo na resposta de uma conexão. Crie o primeiro — a IA pode sugerir o preenchimento a partir de uma amostra real.',
          action: novo,
        }}
        emptyFiltered={{ title: 'Nenhum mapeamento encontrado', description: 'Nenhum mapeamento com esse tipo, conexão ou operação.', onClear: () => setQ('') }}
      />

      <ConfirmDialog
        open={Boolean(acao)}
        danger={acao?.tipo === 'excluir' || acao?.tipo === 'desativar'}
        loading={agindo}
        title={acao ? { ativar: 'Ativar mapeamento', desativar: 'Desativar mapeamento', excluir: 'Excluir mapeamento' }[acao.tipo] : ''}
        message={
          acao
            ? acao.ids.length > 1
              ? `${MENSAGEM[acao.tipo]} Isso vale para os ${acao.ids.length} mapeamentos selecionados.`
              : MENSAGEM[acao.tipo]
            : ''
        }
        confirmLabel={acao ? { ativar: 'Ativar', desativar: 'Desativar', excluir: 'Excluir' }[acao.tipo] : 'Confirmar'}
        onClose={() => setAcao(null)}
        onConfirm={confirmar}
      />
    </>
  );
}
