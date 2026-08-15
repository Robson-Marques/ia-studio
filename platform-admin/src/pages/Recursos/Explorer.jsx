import React, { useEffect, useMemo, useState } from 'react';
import { Screen, PageHeader, Card, Field, Input, Select, Button, DataTable, DescriptionList, Modal, CopyButton, EmptyState, FormGrid, useToast, Spinner } from '@studio-ux-ds/react';
import { getResourceCatalog, exploreResource } from '../../services/resource';
import { listConnections } from '../../services/integrations';

// Recursos/Explorer — consulta de leitura sobre uma conexão, no formato canônico
// da plataforma. Migrada pro DS na v0.10.13.
//
// Decisões de composição:
//
//  · **A linha abre o registro, e o detalhe é Modal — não rota.** Parece exceção
//    à regra dos três containers, mas não é: o registro **não existe na
//    plataforma**. É o que a conexão respondeu agora, nesta busca; não tem id
//    nosso, não sobrevive ao recarregar a página e por isso não pode ter URL. É
//    leitura de campo curto + o JSON bruto → Modal é o container certo.
//  · **Zero botão na linha.** O legado tinha uma coluna "Ações" com um olhinho
//    que fazia exatamente o que o clique na linha já fazia — a mesma ação duas
//    vezes, competindo pelo mesmo clique.
//  · **Tabela desktop + cartões mobile saíram.** O `DataTable` do DS já resolve
//    as duas formas; manter as duas à mão era garantir que divergissem.

export default function Explorer() {
  const toast = useToast();
  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [connectionId, setConnectionId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [query, setQuery] = useState('');

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    (async () => {
      setLoadingMeta(true);
      try {
        const [{ items: cat }, { items: conns }] = await Promise.all([
          getResourceCatalog(),
          listConnections(),
        ]);
        setCatalog(cat);
        setConnections(conns);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const typeLabel = useMemo(() => {
    const map = new Map(catalog.map((t) => [t.type, t.label]));
    return (type) => map.get(type) || type;
  }, [catalog]);

  // Campos do tipo escolhido: os canônicos + os das extensões verticais.
  const campos = useMemo(() => {
    const def = catalog.find((t) => t.type === resourceType);
    if (!def) return [];
    const base = (def.fields || []).map((f) => ({ key: f.key, label: f.label }));
    const ext = (def.extensions || []).flatMap((e) => (e.fields || []).map((f) => ({ key: f.key, label: f.label })));
    return [...base, ...ext];
  }, [catalog, resourceType]);

  async function buscar() {
    if (!connectionId) { toast.error('Escolha a conexão.'); return; }
    if (!resourceType) { toast.error('Escolha o tipo de recurso.'); return; }
    setSearching(true);
    setResult(null);
    try {
      const res = await exploreResource({
        connection_id: connectionId,
        resource_type: resourceType,
        query: query.trim() || undefined,
      });
      setResult(res);
      if (res?.empty) toast.info('A busca não trouxe nenhum registro.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  }

  const registros = result?.records || [];
  // No máximo 6 colunas: além disso a tabela deixa de ser legível e o detalhe
  // resolve melhor (é ele que mostra o registro inteiro).
  const colunasVisiveis = campos.slice(0, 6);

  function celula(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
  }

  const columns = colunasVisiveis.map((c) => ({
    key: c.key,
    header: c.label,
    render: (rec) => (
      <span style={{ fontSize: 12, color: 'var(--su-text-secondary)' }}>{celula(rec[c.key])}</span>
    ),
  }));

  return (
    <Screen as="div" className="space-y-6">
      <PageHeader
        title="Explorador de recursos"
        subtitle="Consulta de leitura: escolha a conexão e o tipo de recurso para ver os dados já traduzidos para o formato da plataforma. Nada é gravado."
      />

      <Card>
        <div style={{ padding: 20 }}>
          {loadingMeta ? (
            <div className="flex justify-center py-6">
              <Spinner size="lg" />
            </div>
          ) : (
            // Linha de busca no `FormGrid`: alinha os campos pelo TOPO. O grid
            // anterior usava `items-end`, que alinha pela base — e o único campo
            // com dica embaixo ficava mais alto, empurrando o próprio controle e
            // o botão para cima. A dica virou **placeholder** por isso, e o botão
            // ficou dentro do campo de busca, onde alinha sempre.
            <FormGrid columns="auto">
              <Field label="Conexão" required>
                <Select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Tipo de recurso" required>
                <Select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                  <option value="">Selecione…</option>
                  {catalog.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                </Select>
              </Field>
              <Field label="Busca (opcional)">
                <div className="flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
                    placeholder="nome, documento, código…"
                    style={{ flex: 1 }}
                  />
                  <Button variant="primary" icon="search" loading={searching} onClick={buscar}>
                    Buscar
                  </Button>
                </div>
              </Field>
            </FormGrid>
          )}
        </div>
      </Card>

      {searching ? (
        <Spinner size="lg" center />
      ) : !result ? (
        <Card>
          <EmptyState
            icon="search"
            title="Faça uma busca"
            description="Escolha a conexão e o tipo de recurso acima. O que vier aparece no formato canônico, do mesmo jeito que os fluxos e os assistentes veem."
          />
        </Card>
      ) : !registros.length ? (
        <Card>
          <EmptyState
            icon="search"
            title="Nenhum registro"
            description={`Nada encontrado para ${typeLabel(result.resource_type)}. A conexão respondeu — a busca é que não casou com nada.`}
          />
        </Card>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--su-text-muted)' }}>
            {registros.length === 1 ? '1 registro' : `${result.count} registros`} · clique numa linha para ver o registro inteiro
          </p>
          <DataTable
            columns={columns}
            rows={registros}
            getRowId={(rec, i) => rec.id || `linha-${i}`}
            onRowClick={(rec) => setDetail(rec)}
            getRowLabel={() => 'Ver este registro por inteiro'}
          />
        </>
      )}

      {/* Leitura de um registro que não existe na plataforma — sem id nosso, sem
          URL possível. Modal é o container correto aqui. */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Registro" size="lg">
        {detail && (
          <div className="space-y-4">
            <DescriptionList
              items={(campos.length ? campos : Object.keys(detail).map((k) => ({ key: k, label: k })))
                .map((c) => ({ key: c.label, value: celula(detail[c.key]) }))}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                  Como a plataforma vê este registro
                </p>
                <CopyButton
                  value={JSON.stringify(detail, null, 2)}
                  label="Copiar"
                  onCopied={(ok) => { if (!ok) toast.error('Não deu para copiar — selecione e copie à mão.'); }}
                />
              </div>
              <pre
                style={{
                  fontFamily: 'var(--su-font-mono, monospace)', fontSize: 11, margin: 0,
                  border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12,
                  maxHeight: 320, overflow: 'auto', color: 'var(--su-text-secondary)',
                }}
              >
                {JSON.stringify(detail, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </Screen>
  );
}
