import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, Field, Input, TextArea, Select, Checkbox, Button, IconButton,
  Banner, useToast,
} from '@studio-ux-ds/react';
import {
  getResourceCatalog, listMappings, createMapping, updateMapping, suggestMapping,
} from '../../services/resource';
import { listConnections } from '../../services/integrations';

// Recursos/MapeamentoEditor — criar ou editar um mapeamento (v0.10.13).
//
// Rotas: `/recursos/mapeamentos/novo` e `/recursos/mapeamentos/:id`. Era um Modal
// `xl`; virou rota porque tem dois campos de texto longo (descrição e parâmetros
// de amostra em JSON) e porque é onde se trabalha de verdade — o editor de campos
// cresce com o tipo escolhido e no modal rolava dentro de outra rolagem.
//
// A sugestão da IA **preenche o editor e para aí**: quem salva é a pessoa. Isso é
// deliberado e está escrito na tela — a IA colhe uma amostra real da conexão e
// adivinha de onde vem cada campo; adivinhar errado num mapeamento significa
// dado trocado em silêncio depois, então o passo de revisão não é cerimônia.

export default function MapeamentoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [catalog, setCatalog] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [chavesDaAmostra, setChavesDaAmostra] = useState([]);

  const [form, setForm] = useState({
    connection_id: '', resource_type: '', source_operation: '',
    description: '', is_active: false, sample_params: '',
  });
  const [linhas, setLinhas] = useState([]); // [{ canonical, path }]

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const [{ items: cat }, { items: conns }] = await Promise.all([
          getResourceCatalog(),
          listConnections(),
        ]);
        if (cancelado) return;
        setCatalog(cat);
        setConnections(conns);
        if (isEdit) {
          // Não há endpoint de "um mapeamento": a lista é a fonte.
          const { items: maps } = await listMappings();
          if (cancelado) return;
          const m = maps.find((x) => x.id === id);
          if (!m) {
            toast.error('Mapeamento não encontrado — ele pode ter sido excluído.');
            navigate('/recursos/mapeamentos', { replace: true });
            return;
          }
          setForm({
            connection_id: m.connection_id || '',
            resource_type: m.resource_type || '',
            source_operation: m.source_operation || '',
            description: m.description || '',
            is_active: !!m.is_active,
            sample_params: '',
          });
          setLinhas(Object.entries(m.field_map || {}).map(([canonical, path]) => ({ canonical, path: String(path ?? '') })));
        }
      } catch (err) {
        if (!cancelado) {
          toast.error(err.message);
          navigate('/recursos/mapeamentos', { replace: true });
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const conexao = connections.find((c) => c.id === form.connection_id) || null;
  const tipoDef = catalog.find((t) => t.type === form.resource_type) || null;

  // Campos que este tipo aceita — os canônicos + os das extensões verticais.
  const camposCanonicos = useMemo(() => {
    if (!tipoDef) return [];
    const base = (tipoDef.fields || []).map((f) => ({ key: f.key, label: f.label }));
    const ext = (tipoDef.extensions || []).flatMap((e) => (e.fields || []).map((f) => ({ key: f.key, label: `${f.label} · ${e.vertical}` })));
    return [...base, ...ext];
  }, [tipoDef]);

  const addLinha = () => setLinhas((prev) => [...prev, { canonical: '', path: '' }]);
  const removeLinha = (i) => setLinhas((prev) => prev.filter((_, idx) => idx !== i));
  const patchLinha = (i, p) => setLinhas((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  async function sugerir() {
    if (!form.connection_id) { toast.error('Escolha a conexão — é dela que sai a amostra.'); return; }
    if (!form.resource_type) { toast.error('Escolha para qual tipo vai traduzir.'); return; }
    if (!form.source_operation.trim()) { toast.error('Informe a operação que devolve os dados.'); return; }
    let sampleParams;
    if (form.sample_params.trim()) {
      try { sampleParams = JSON.parse(form.sample_params); }
      catch { toast.error('Os parâmetros de amostra não são um JSON válido.'); return; }
    }
    setSugerindo(true);
    try {
      const res = await suggestMapping({
        connection_id: form.connection_id,
        resource_type: form.resource_type,
        source_operation: form.source_operation.trim(),
        sample_params: sampleParams,
      });
      const sugerido = res?.suggested_field_map || {};
      setChavesDaAmostra(Array.isArray(res?.sample_keys) ? res.sample_keys : []);
      setLinhas(Object.entries(sugerido).map(([canonical, path]) => ({ canonical, path: String(path ?? '') })));
      const n = Object.keys(sugerido).length;
      const como = res?.strategy === 'ai' ? 'pela IA' : 'por semelhança de nome';
      toast.info(`${n} campo(s) preenchido(s) ${como}. Confira antes de salvar.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSugerindo(false);
    }
  }

  function linhasParaMapa() {
    const out = {};
    for (const r of linhas) {
      const c = (r.canonical || '').trim();
      const p = (r.path || '').trim();
      if (c && p) out[c] = p;
    }
    return out;
  }

  async function salvar() {
    if (!isEdit && !form.connection_id) { toast.error('Escolha a conexão.'); return; }
    if (!isEdit && !form.resource_type) { toast.error('Escolha para qual tipo vai traduzir.'); return; }
    if (!form.source_operation.trim()) { toast.error('Informe a operação que devolve os dados.'); return; }
    const fieldMap = linhasParaMapa();
    if (!Object.keys(fieldMap).length) {
      toast.error('Mapeie pelo menos um campo — sem isso o mapeamento não traduz nada.');
      return;
    }

    setSalvando(true);
    try {
      if (isEdit) {
        await updateMapping(id, {
          source_operation: form.source_operation.trim(),
          field_map: fieldMap,
          description: form.description.trim() || undefined,
          is_active: form.is_active,
        });
        toast.success('Mapeamento salvo.');
      } else {
        await createMapping({
          provider_key: conexao?.provider_key,
          connection_id: form.connection_id,
          resource_type: form.resource_type,
          source_operation: form.source_operation.trim(),
          field_map: fieldMap,
          description: form.description.trim() || undefined,
          is_active: form.is_active,
          workspace_id: conexao?.workspace_id || undefined,
          environment_id: conexao?.environment_id || undefined,
        });
        toast.success('Mapeamento criado.');
      }
      navigate('/recursos/mapeamentos');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Carregando…" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Editar mapeamento' : 'Novo mapeamento'}
        subtitle="Diga de onde vem cada campo na resposta da conexão."
        actions={
          <>
            <Button variant="secondary" disabled={salvando} onClick={() => navigate('/recursos/mapeamentos')}>
              Cancelar
            </Button>
            <Button variant="primary" icon="save" loading={salvando} onClick={salvar}>
              Salvar
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ padding: 20, maxWidth: 860 }} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Conexão" required hint={isEdit ? 'Não muda depois de criado.' : 'De qual sistema vêm os dados.'}>
              <Select value={form.connection_id} onChange={(e) => patch({ connection_id: e.target.value })} disabled={isEdit}>
                <option value="">Selecione…</option>
                {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Traduz para" required hint={isEdit ? 'Não muda depois de criado.' : 'O tipo que a plataforma entende.'}>
              <Select value={form.resource_type} onChange={(e) => patch({ resource_type: e.target.value })} disabled={isEdit}>
                <option value="">Selecione…</option>
                {catalog.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Operação de origem" required hint='A operação do conector que devolve estes dados. Ex.: "cliente.dados".'>
            <Input
              value={form.source_operation}
              onChange={(e) => patch({ source_operation: e.target.value })}
              placeholder="cliente.dados"
              style={{ fontFamily: 'var(--su-font-mono, monospace)' }}
            />
          </Field>

          <Field label="Anotação" hint="Para quem mexer nisso depois — o que este mapeamento resolve, o que tem de peculiar.">
            <TextArea rows={2} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20, maxWidth: 860 }} className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Deixar a IA preencher
              </h2>
              <p style={{ fontSize: 12, margin: '4px 0 0', maxWidth: 560, color: 'var(--su-text-muted)' }}>
                Ela busca uma resposta de verdade na conexão e chuta de onde vem cada campo. O resultado **só preenche a
                lista abaixo** — quem salva é você.
              </p>
            </div>
            <Button variant="secondary" icon="zap" loading={sugerindo} onClick={sugerir}>
              Preencher com IA
            </Button>
          </div>
          <Field label="Parâmetros para a amostra" hint='Opcional, em JSON. Serve quando a operação exige um argumento para devolver algo. Ex.: { "login": "teste" }'>
            <TextArea
              rows={2}
              style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
              value={form.sample_params}
              onChange={(e) => patch({ sample_params: e.target.value })}
              placeholder='{ "login": "teste" }'
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20, maxWidth: 860 }} className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                De onde vem cada campo
              </h2>
              <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--su-text-muted)' }}>
                À esquerda o campo da plataforma; à direita o caminho dele na resposta da conexão.
              </p>
            </div>
            <Button variant="ghost" icon="plus" disabled={!tipoDef} onClick={addLinha}>
              Adicionar campo
            </Button>
          </div>

          {!tipoDef ? (
            <Banner tone="info">Escolha para qual tipo vai traduzir — é ele que define quais campos existem.</Banner>
          ) : !linhas.length ? (
            <Banner tone="warning">
              Nenhum campo mapeado ainda. Use “Preencher com IA” ou adicione um por um — sem pelo menos um campo, o
              mapeamento não traduz nada.
            </Banner>
          ) : (
            <div className="space-y-2">
              {linhas.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <Select value={r.canonical} onChange={(e) => patchLinha(i, { canonical: e.target.value })}>
                    <option value="">Campo da plataforma…</option>
                    {camposCanonicos.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </Select>
                  <Input
                    style={{ fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12 }}
                    list={chavesDaAmostra.length ? 'chaves-da-amostra' : undefined}
                    value={r.path}
                    onChange={(e) => patchLinha(i, { path: e.target.value })}
                    placeholder="ex.: data.nome ou endereco.0.cidade"
                  />
                  <IconButton
                    icon="trash"
                    title="Tirar este campo do mapeamento"
                    aria-label="Tirar este campo do mapeamento"
                    onClick={() => removeLinha(i)}
                  />
                </div>
              ))}
              {chavesDaAmostra.length > 0 && (
                // Sugestões vindas da amostra real: o campo aceita qualquer
                // caminho, mas oferece os que existem de fato na resposta.
                <datalist id="chaves-da-amostra">
                  {chavesDaAmostra.map((k) => <option key={k} value={k} />)}
                </datalist>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20, maxWidth: 860 }}>
          {/* `Checkbox variant="card"`, não `Switch`: é um campo do formulário
              (vale ao salvar), não um interruptor de efeito imediato. E o
              `Switch` do DS não tem rótulo — um interruptor solto não diz o que
              liga. A condição vai no `meta`, como manda o padrão da v1.2.20. */}
          <Checkbox
            variant="card"
            checked={form.is_active}
            onChange={(e) => patch({ is_active: e.target.checked })}
            label="Pôr em uso ao salvar"
            meta="Mapeamento nasce fora de uso de propósito: assim dá para revisar o que a IA sugeriu antes de o dado começar a circular traduzido."
          />
        </div>
      </Card>
    </div>
  );
}
