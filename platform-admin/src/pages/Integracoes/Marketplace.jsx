import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Input, Select, Badge, Button, EmptyState, ConfirmDialog, useToast, Spinner } from '@studio-ux-ds/react';
import { getMarketplace, installProvider, uninstallProvider } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { CATEGORY_LABELS, categoryLabel } from './integration.constants';

// Integrações/Marketplace — a prateleira de conectores. Migrada pro DS na v0.10.11.
//
// Continua em GRADE, e não em tabela: aqui não se compara número nem se opera em
// lote — se escolhe um conector lendo o que ele faz. A tabela serve quando a
// pergunta é "qual está pior?"; a grade serve quando é "qual eu quero?".
//
// **Conectar deixou de abrir modal**: navega para `/integracoes/conexoes/nova
// ?provider=<chave>`, o mesmo passo a passo da tela de Conexões. Antes existiam
// dois caminhos para criar conexão — o wizard daqui e o de lá — e eles podiam
// divergir sem ninguém notar.
//
// **Bug consertado junto:** o `load()` chamava `toast.error(...)` sem que este
// arquivo tivesse `useToast()`. Se a lista falhasse, o `catch` estourava
// `ReferenceError: toast is not defined` — o tratamento de erro era o erro.
// Ninguém viu porque só acontece quando a chamada falha.

export default function Marketplace() {
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [agindo, setAgindo] = useState(null);   // chave em ação
  const [removendo, setRemovendo] = useState(null); // item aguardando confirmação

  const podeGerenciar = can('integrations.marketplace.manage');
  const podeConectar = can('integrations.connections.write');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await getMarketplace();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter((i) => {
      if (categoria && i.category !== categoria) return false;
      if (q && !`${i.name} ${i.description} ${i.key}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, busca, categoria]);

  const porCategoria = useMemo(() => {
    const map = new Map();
    filtrados.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    });
    return Array.from(map.entries());
  }, [filtrados]);

  async function instalar(item) {
    setAgindo(item.key);
    try {
      await installProvider(item.key);
      toast.success(`“${item.name}” instalado. Agora dá para criar conexões dele.`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAgindo(null);
    }
  }

  async function desinstalar() {
    if (!removendo) return;
    setAgindo(removendo.key);
    try {
      await uninstallProvider(removendo.key);
      toast.success(`“${removendo.name}” desinstalado.`);
      setRemovendo(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAgindo(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        subtitle="Os sistemas com que a plataforma sabe conversar. Instalar habilita o conector para a organização; conectar é o passo seguinte."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Procurar conector…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ width: 220 }}
            />
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: 190 }}>
              <option value="">Todas as categorias</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        }
      />

      {loading && !items.length ? (
        <Spinner size="lg" center />
      ) : !filtrados.length ? (
        <Card>
          <EmptyState
            icon="search"
            title="Nenhum conector com esse filtro"
            description="Mude a busca ou a categoria. Se o sistema que você procura não está aqui, ele ainda não tem conector."
          />
        </Card>
      ) : (
        porCategoria.map(([cat, lista]) => (
          <div key={cat} className="space-y-2">
            <h2 style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--su-text-muted)' }}>
              {categoryLabel(cat)}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {lista.map((item) => (
                <Card key={item.key}>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>
                          {item.name}
                        </p>
                        {item.installed && <Badge tone="success">instalado</Badge>}
                        {!item.has_implementation && <Badge tone="neutral">em breve</Badge>}
                      </div>
                      <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--su-text-muted)' }}>
                        {item.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 'auto' }}>
                      {!item.installed && podeGerenciar && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon="download"
                          loading={agindo === item.key}
                          title="Habilita este conector para a organização — ainda não cria nenhuma conexão"
                          onClick={() => instalar(item)}
                        >
                          Instalar
                        </Button>
                      )}
                      {item.installed && podeConectar && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon="zap"
                          disabled={!item.has_implementation}
                          title={item.has_implementation
                            ? 'Abre o passo a passo de conexão deste conector'
                            : 'Este conector ainda não aceita conexão'}
                          onClick={() => navigate(`/integracoes/conexoes/nova?provider=${item.key}`)}
                        >
                          Conectar
                        </Button>
                      )}
                      {item.installed && podeGerenciar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          loading={agindo === item.key}
                          title="Tira o conector da organização — exige que as conexões dele estejam desativadas"
                          onClick={() => setRemovendo(item)}
                        >
                          Desinstalar
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <ConfirmDialog
        open={Boolean(removendo)}
        danger
        loading={Boolean(agindo)}
        title="Desinstalar conector"
        message={`Tirar “${removendo?.name}” da organização? As conexões existentes NÃO são apagadas, mas precisam estar desativadas para a desinstalação passar. Dá para instalar de novo quando quiser.`}
        confirmLabel="Desinstalar"
        onClose={() => setRemovendo(null)}
        onConfirm={desinstalar}
      />
    </div>
  );
}
