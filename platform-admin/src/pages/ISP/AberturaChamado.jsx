import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, EmptyState, FormGrid, Field, Input, Select, Radio, Button, useToast,
} from '@studio-ux-ds/react';
import {
  discoverOsResources, getOsConfig, saveOsConfig,
  getFilaMapping, saveFilaMapping,
  getBoletoMax, saveBoletoMax,
  getPagamentoConfig, savePagamentoConfig,
  getPlantaoConfig, savePlantaoConfig,
} from '../../services/isp';
import { listQueues, listTeams } from '../../services/whatsapp';
import { usePermissions } from '../../hooks/usePermissions';

// ISP/AberturaChamado — 2ª tela da família ISP migrada pro DS (v0.9.92).
//
// É uma tela de CONFIGURAÇÃO com 5 assuntos independentes, cada um com seu
// próprio endpoint de gravação. Por isso cada `Card` tem o seu botão de salvar:
// não é violação de P6 (uma primária por contexto) — cada card É um contexto, e
// o rótulo diz o que salva ("Salvar filas", "Salvar boletos") em vez de um
// "Salvar" ambíguo. Um botão único no topo daria a impressão falsa de que tudo
// grava junto, e um erro num assunto derrubaria a gravação dos outros.
//
// Migração: `<select className="input">` e `<input className="input">` crus (a
// classe legada do projeto) viraram `Select`/`Input` do DS dentro de `Field`;
// os `<label>` montados à mão viraram o próprio `Field` (rótulo + hint).
//
// **A estrela virou radio.** "Qual par é o padrão de suporte" é escolha ÚNICA —
// e pela regra do DS (v1.2.15) escolha única tem forma de círculo. A estrela
// amarela (`#f59e0b` hardcoded) não dizia "só um" nem era focável por teclado.

export default function AberturaChamado() {
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('isp.incidents.write');

  const [loading, setLoading] = useState(true);
  const [connectionId, setConnectionId] = useState(null);

  // Pares setor↔assunto
  const [setores, setSetores] = useState([]);
  const [assuntos, setAssuntos] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [saving, setSaving] = useState(false);

  // Filas
  const [queues, setQueues] = useState([]);
  const [filaSuporte, setFilaSuporte] = useState('');
  const [filaFinanceiro, setFilaFinanceiro] = useState('');
  const [savingFilas, setSavingFilas] = useState(false);

  // Boletos
  const [boletoMax, setBoletoMax] = useState(3);
  const [savingBoleto, setSavingBoleto] = useState(false);

  // Link de pagamento
  const [pagTtl, setPagTtl] = useState(24);
  const [pagBaseUrl, setPagBaseUrl] = useState('');
  const [savingPag, setSavingPag] = useState(false);

  // Plantão
  const [teams, setTeams] = useState([]);
  const [plantao, setPlantao] = useState({ team_id: '', limiar_pct: 40, template: '', cooldown_min: 60 });
  const [savingPlantao, setSavingPlantao] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const disc = await discoverOsResources();
      setSetores(disc?.setores ?? []);
      setAssuntos(disc?.assuntos ?? []);
      setConnectionId(disc?.connection_id ?? null);
      if (disc?.connection_id) {
        const cfg = await getOsConfig(disc.connection_id);
        setPairs((cfg || []).map((c) => ({ setor_id: c.setor_id, assunto_id: c.assunto_id, is_default: !!c.is_default })));
      }
      const [qs, map, bmax, pag, tms, plt] = await Promise.all([
        listQueues(), getFilaMapping(), getBoletoMax(), getPagamentoConfig(), listTeams(), getPlantaoConfig(),
      ]);
      setQueues(qs || []);
      setFilaSuporte(map?.suporte || '');
      setFilaFinanceiro(map?.financeiro || '');
      setBoletoMax(Number.isFinite(bmax) ? bmax : 3);
      setPagTtl(pag?.ttl_horas || 24);
      setPagBaseUrl(pag?.base_url || '');
      setTeams(tms || []);
      setPlantao({
        team_id: plt?.team_id || '',
        limiar_pct: plt?.limiar_pct || 40,
        template: plt?.template || '',
        cooldown_min: plt?.cooldown_min ?? 60,
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pares setor ↔ assunto ──
  const addPair = () => setPairs((p) => [...p, { setor_id: '', assunto_id: '', is_default: p.length === 0 }]);
  const updatePair = (i, field, value) => setPairs((p) => p.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  const setDefault = (i) => setPairs((p) => p.map((x, idx) => ({ ...x, is_default: idx === i })));
  const removePair = (i) => setPairs((p) => p.filter((_, idx) => idx !== i));

  async function handleSavePairs() {
    if (!connectionId) { toast.error('Nenhuma conexão de provedor encontrada.'); return; }
    const valid = pairs.filter((p) => p.setor_id && p.assunto_id);
    if (pairs.length && valid.length !== pairs.length) {
      toast.error('Preencha departamento e assunto em todas as linhas.'); return;
    }
    if (valid.length && !valid.some((p) => p.is_default)) valid[0].is_default = true;
    setSaving(true);
    try {
      const setorNome = (id) => setores.find((s) => String(s.id) === String(id))?.name ?? null;
      const assuntoNome = (id) => assuntos.find((a) => String(a.id) === String(id))?.name ?? null;
      await saveOsConfig(connectionId, valid.map((p) => ({
        setor_id: p.setor_id,
        setor_nome: setorNome(p.setor_id),
        assunto_id: p.assunto_id,
        assunto_nome: assuntoNome(p.assunto_id),
        is_default: !!p.is_default,
        active: true,
      })));
      toast.success('Configuração de abertura de chamado salva.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFilas() {
    setSavingFilas(true);
    try {
      await saveFilaMapping({ suporte: filaSuporte || null, financeiro: filaFinanceiro || null });
      toast.success('Filas de setor salvas.');
    } catch (err) { toast.error(err.message); }
    finally { setSavingFilas(false); }
  }

  async function handleSaveBoleto() {
    setSavingBoleto(true);
    try {
      const saved = await saveBoletoMax(Number(boletoMax));
      if (Number.isFinite(saved)) setBoletoMax(saved);
      toast.success('Limite de boletos salvo.');
    } catch (err) { toast.error(err.message); }
    finally { setSavingBoleto(false); }
  }

  async function handleSavePag() {
    const url = pagBaseUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error('O endereço público deve começar com http:// ou https://'); return;
    }
    setSavingPag(true);
    try {
      const saved = await savePagamentoConfig({ ttl_horas: Number(pagTtl), base_url: url });
      if (saved) { setPagTtl(saved.ttl_horas || 24); setPagBaseUrl(saved.base_url || ''); }
      toast.success('Link de pagamento salvo.');
    } catch (err) { toast.error(err.message); }
    finally { setSavingPag(false); }
  }

  async function handleSavePlantao() {
    setSavingPlantao(true);
    try {
      const saved = await savePlantaoConfig({
        team_id: plantao.team_id || null,
        limiar_pct: Number(plantao.limiar_pct),
        template: plantao.template || null,
        cooldown_min: Number(plantao.cooldown_min),
      });
      if (saved) {
        setPlantao({
          team_id: saved.team_id || '',
          limiar_pct: saved.limiar_pct || 40,
          template: saved.template || '',
          cooldown_min: saved.cooldown_min ?? 60,
        });
      }
      toast.success('Equipe de plantão salva.');
    } catch (err) { toast.error(err.message); }
    finally { setSavingPlantao(false); }
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

  const semRecursos = !setores.length && !assuntos.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abertura de chamado"
        subtitle="O que o assistente usa quando precisa abrir um chamado, encaminhar a conversa, mandar boleto ou avisar a equipe."
      />

      {/* ── Departamento e assunto do chamado ── */}
      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Departamento e assunto do chamado
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              O chamado nasce do par <strong>departamento + assunto</strong>. O assunto precisa ter um processo de O.S.
              vinculado no ERP. Marque qual par o assistente usa por padrão no suporte. O departamento é o do
              atendimento (Suporte / Financeiro) — se você configurou antes da atualização, escolha de novo aqui.
            </p>
          </div>

          {semRecursos ? (
            <EmptyState
              icon="settings"
              title="Nenhum departamento ou assunto encontrado"
              description="Verifique se existe uma conexão de provedor ativa. Os departamentos e assuntos são lidos do próprio ERP."
            />
          ) : (
            <>
              {pairs.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
                  Nenhum par configurado. Adicione ao menos um e marque como padrão.
                </p>
              )}

              <div className="space-y-2">
                {pairs.map((p, i) => (
                  <div
                    key={i}
                    style={{ border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 12 }}
                    className="space-y-3"
                  >
                    {/* Linha 1: os dois campos do par + remover. */}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1" style={{ minWidth: 180 }}>
                        <Field label="Departamento">
                          {setores.length > 0 ? (
                            <Select
                              value={p.setor_id}
                              disabled={!canManage}
                              onChange={(e) => updatePair(i, 'setor_id', e.target.value)}
                            >
                              <option value="">Selecione…</option>
                              {setores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </Select>
                          ) : (
                            // Nenhum departamento descoberto: cai no id manual.
                            <Input
                              value={p.setor_id}
                              disabled={!canManage}
                              placeholder="Id do departamento no ERP"
                              onChange={(e) => updatePair(i, 'setor_id', e.target.value)}
                            />
                          )}
                        </Field>
                      </div>

                      <div className="flex-1" style={{ minWidth: 180 }}>
                        <Field label="Assunto">
                          <Select
                            value={p.assunto_id}
                            disabled={!canManage}
                            onChange={(e) => updatePair(i, 'assunto_id', e.target.value)}
                          >
                            <option value="">Selecione…</option>
                            {assuntos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </Select>
                        </Field>
                      </div>

                      {canManage && (
                        <Button
                          variant="ghost"
                          icon="trash"
                          aria-label="Remover este par"
                          style={{ marginBottom: 1 }}
                          onClick={() => removePair(i)}
                        />
                      )}
                    </div>

                    {/* Linha 2: a escolha do par padrão. Ganhou linha própria
                        porque é uma decisão SOBRE o par inteiro, não um terceiro
                        campo dele — encaixada no fim da linha dos selects ela
                        ficava sem rótulo de cabeçalho como os vizinhos, num
                        baseline diferente e disputando espaço com a lixeira.
                        Escolha única → círculo (regra do DS v1.2.15). */}
                    <Radio
                      name="os-par-padrao"
                      label="Usar este par como padrão do suporte"
                      checked={!!p.is_default}
                      disabled={!canManage}
                      onChange={() => setDefault(i)}
                    />
                  </div>
                ))}
              </div>

              {canManage && (
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" icon="plus" onClick={addPair}>Adicionar par</Button>
                  <Button variant="primary" icon="check" loading={saving} onClick={handleSavePairs}>
                    {saving ? 'Salvando…' : 'Salvar pares'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* ── Filas de setor ── */}
      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Para onde encaminhar a conversa
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              A fila que recebe a conversa quando o assistente termina o atendimento. Crie ou renomeie as filas em
              WhatsApp → Equipes e Filas.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field label="Chamados técnicos (Suporte)">
              <Select value={filaSuporte} disabled={!canManage} onChange={(e) => setFilaSuporte(e.target.value)}>
                <option value="">— não encaminhar —</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
            </Field>
            <Field label="Bloqueio e 2ª via (Financeiro)">
              <Select value={filaFinanceiro} disabled={!canManage} onChange={(e) => setFilaFinanceiro(e.target.value)}>
                <option value="">— não encaminhar —</option>
                {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </Select>
            </Field>
          </FormGrid>

          {!queues.length && (
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Nenhuma fila cadastrada. Crie as filas em WhatsApp → Equipes e Filas e volte aqui para escolher.
            </p>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button variant="primary" icon="check" loading={savingFilas} onClick={handleSaveFilas}>
                {savingFilas ? 'Salvando…' : 'Salvar filas'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Envio de boletos ── */}
      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Quantos boletos por mensagem
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              Quantos boletos em aberto o assistente manda de uma vez. Ele mostra sempre os vencidos primeiro; se
              houver mais, avisa e oferece enviar o restante.
            </p>
          </div>

          <div style={{ maxWidth: 280 }}>
            <Field label="Máximo por mensagem">
              <Select value={String(boletoMax)} disabled={!canManage} onChange={(e) => setBoletoMax(Number(e.target.value))}>
                <option value="1">1 boleto</option>
                <option value="2">2 boletos</option>
                <option value="3">3 boletos</option>
                <option value="5">5 boletos</option>
                <option value="10">10 boletos</option>
                <option value="0">Todos os em aberto</option>
              </Select>
            </Field>
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button variant="primary" icon="check" loading={savingBoleto} onClick={handleSaveBoleto}>
                {savingBoleto ? 'Salvando…' : 'Salvar limite'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Link de pagamento ── */}
      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Link de pagamento
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              O assistente gera um link temporário com a 2ª via para o cliente pagar sem login. Escolha por quanto
              tempo o link vale e informe o endereço público do sistema, que é onde a página de pagamento abre.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field label="Validade do link">
              <Select value={String(pagTtl)} disabled={!canManage} onChange={(e) => setPagTtl(Number(e.target.value))}>
                <option value="1">1 hora</option>
                <option value="6">6 horas</option>
                <option value="24">24 horas</option>
                <option value="48">48 horas</option>
              </Select>
            </Field>
            <Field label="Endereço público do sistema">
              <Input
                value={pagBaseUrl}
                disabled={!canManage}
                placeholder="https://seu-dominio.com.br"
                onChange={(e) => setPagBaseUrl(e.target.value)}
              />
            </Field>
          </FormGrid>

          {!pagBaseUrl && (
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Sem o endereço público o assistente não consegue gerar o link — ele avisa e manda a linha digitável direto.
            </p>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button variant="primary" icon="check" loading={savingPag} onClick={handleSavePag}>
                {savingPag ? 'Salvando…' : 'Salvar link'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ── Equipe de plantão ── */}
      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
              Quem é avisado de instabilidade na rede
            </h2>
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: '4px 0 0' }}>
              Quando o assistente identifica instabilidade na região de um cliente sem incidente cadastrado, ele avisa
              a equipe por WhatsApp e abre um rascunho de incidente. Recebem o aviso os membros desta equipe com
              telefone cadastrado e o aviso ligado (em WhatsApp → Equipes e Filas). O assistente nunca escolhe quem
              recebe — vem daqui.
            </p>
          </div>

          <FormGrid columns={2}>
            <Field label="Equipe responsável">
              <Select
                value={plantao.team_id}
                disabled={!canManage}
                onChange={(e) => setPlantao((p) => ({ ...p, team_id: e.target.value }))}
              >
                <option value="">— não avisar —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Considerar instabilidade a partir de" hint="Porcentagem da região sem conexão.">
              <Select
                value={String(plantao.limiar_pct)}
                disabled={!canManage}
                onChange={(e) => setPlantao((p) => ({ ...p, limiar_pct: Number(e.target.value) }))}
              >
                {[20, 30, 40, 50, 60, 70].map((v) => <option key={v} value={String(v)}>{v}% da região</option>)}
              </Select>
            </Field>
            <Field label="Modelo de mensagem aprovado" hint="Nome do template aprovado na Meta.">
              <Input
                value={plantao.template}
                disabled={!canManage}
                placeholder="nome_do_template_aprovado"
                onChange={(e) => setPlantao((p) => ({ ...p, template: e.target.value }))}
              />
            </Field>
            <Field label="Intervalo mínimo entre avisos">
              <Select
                value={String(plantao.cooldown_min)}
                disabled={!canManage}
                onChange={(e) => setPlantao((p) => ({ ...p, cooldown_min: Number(e.target.value) }))}
              >
                <option value="0">Sem intervalo</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
                <option value="240">4 horas</option>
              </Select>
            </Field>
          </FormGrid>

          {!plantao.template && (
            <p style={{ fontSize: 12, color: 'var(--su-text-muted)', margin: 0 }}>
              Sem um modelo aprovado, o aviso fora da janela de 24h não sai pela Meta — a equipe recebe o alerta
              interno no sistema como reserva.
            </p>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button variant="primary" icon="check" loading={savingPlantao} onClick={handleSavePlantao}>
                {savingPlantao ? 'Salvando…' : 'Salvar plantão'}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
