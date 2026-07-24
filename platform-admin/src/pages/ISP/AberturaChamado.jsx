import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Wrench, Star, Users, Receipt, Link2, BellRing } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { discoverOsResources, getOsConfig, saveOsConfig, getFilaMapping, saveFilaMapping, getBoletoMax, saveBoletoMax, getPagamentoConfig, savePagamentoConfig, getPlantaoConfig, savePlantaoConfig } from '../../services/isp';
import { listQueues, listTeams } from '../../services/whatsapp';

// Configura a abertura de OS pela IA: pares setor↔assunto do ERP (descobertos),
// com um marcado como padrão de suporte. A IA só usa o que está aqui.
export default function AberturaChamado() {
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can('isp.incidents.write');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionId, setConnectionId] = useState(null);
  const [setores, setSetores] = useState([]);
  const [assuntos, setAssuntos] = useState([]);
  const [pairs, setPairs] = useState([]); // { setor_id, assunto_id, is_default }
  const [queues, setQueues] = useState([]);
  const [filaSuporte, setFilaSuporte] = useState('');
  const [filaFinanceiro, setFilaFinanceiro] = useState('');
  const [savingFilas, setSavingFilas] = useState(false);
  const [boletoMax, setBoletoMax] = useState(3);
  const [savingBoleto, setSavingBoleto] = useState(false);
  const [pagTtl, setPagTtl] = useState(24);
  const [pagBaseUrl, setPagBaseUrl] = useState('');
  const [savingPag, setSavingPag] = useState(false);
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

  async function handleSaveFilas() {
    setSavingFilas(true);
    try {
      await saveFilaMapping({ suporte: filaSuporte || null, financeiro: filaFinanceiro || null });
      toast.success('Filas de setor salvas.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingFilas(false);
    }
  }

  async function handleSaveBoleto() {
    setSavingBoleto(true);
    try {
      const saved = await saveBoletoMax(Number(boletoMax));
      if (Number.isFinite(saved)) setBoletoMax(saved);
      toast.success('Limite de boletos salvo.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingBoleto(false);
    }
  }

  async function handleSavePag() {
    const url = pagBaseUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) { toast.error('O endereço público deve começar com http:// ou https://'); return; }
    setSavingPag(true);
    try {
      const saved = await savePagamentoConfig({ ttl_horas: Number(pagTtl), base_url: url });
      if (saved) { setPagTtl(saved.ttl_horas || 24); setPagBaseUrl(saved.base_url || ''); }
      toast.success('Link de pagamento salvo.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPag(false);
    }
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
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPlantao(false);
    }
  }

  useEffect(() => { load(); }, []);

  function addPair() {
    setPairs((p) => [...p, { setor_id: '', assunto_id: '', is_default: p.length === 0 }]);
  }
  function updatePair(i, field, value) {
    setPairs((p) => p.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));
  }
  function setDefault(i) {
    setPairs((p) => p.map((x, idx) => ({ ...x, is_default: idx === i })));
  }
  function removePair(i) {
    setPairs((p) => p.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!connectionId) { toast.error('Nenhuma conexão de ERP encontrada.'); return; }
    const valid = pairs.filter((p) => p.setor_id && p.assunto_id);
    if (pairs.length && valid.length !== pairs.length) { toast.error('Preencha setor e assunto em todas as linhas.'); return; }
    if (valid.length && !valid.some((p) => p.is_default)) valid[0].is_default = true;
    setSaving(true);
    try {
      const setorNome = (id) => setores.find((s) => String(s.id) === String(id))?.name ?? null;
      const assuntoNome = (id) => assuntos.find((a) => String(a.id) === String(id))?.name ?? null;
      const payload = valid.map((p) => ({
        setor_id: p.setor_id,
        setor_nome: setorNome(p.setor_id),
        assunto_id: p.assunto_id,
        assunto_nome: assuntoNome(p.assunto_id),
        is_default: !!p.is_default,
        active: true,
      }));
      await saveOsConfig(connectionId, payload);
      toast.success('Configuração de abertura de chamado salva.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
          <Wrench size={20} /> Abertura de chamado
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Escolha o <b>departamento</b> e o <b>assunto</b> que a IA usa ao abrir o atendimento (a OS nasce dele). O assunto precisa
          ter um processo de O.S. vinculado no IXC. Marque um par como padrão de suporte. <b>Importante:</b> o departamento é o do
          atendimento (Suporte/Financeiro) — se você configurou antes da atualização, re-escolha aqui.
        </p>
      </div>

      {!setores.length && !assuntos.length ? (
        <EmptyState
          icon={Wrench}
          title="Nenhum setor/assunto encontrado"
          description="Verifique se há uma conexão de provedor (ISP) ativa. Os setores e assuntos são lidos do próprio ERP."
        />
      ) : (
        <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
          {pairs.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
              Nenhum par configurado. Adicione ao menos um (setor + assunto) e marque como padrão.
            </p>
          )}

          {pairs.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {setores.length > 0 ? (
                <select
                  className="input text-sm flex-1 min-w-[160px]"
                  value={p.setor_id}
                  disabled={!canManage}
                  onChange={(e) => updatePair(i, 'setor_id', e.target.value)}
                >
                  <option value="">Setor…</option>
                  {setores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <input
                  className="input text-sm flex-1 min-w-[160px]"
                  value={p.setor_id}
                  disabled={!canManage}
                  placeholder="Id do setor no IXC"
                  title="Nenhum setor foi descoberto — informe o id do setor de OS do seu IXC."
                  onChange={(e) => updatePair(i, 'setor_id', e.target.value)}
                />
              )}
              <select
                className="input text-sm flex-1 min-w-[160px]"
                value={p.assunto_id}
                disabled={!canManage}
                onChange={(e) => updatePair(i, 'assunto_id', e.target.value)}
              >
                <option value="">Assunto…</option>
                {assuntos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button
                type="button"
                title="Usar como padrão de suporte"
                onClick={() => setDefault(i)}
                disabled={!canManage}
                className="p-1.5 rounded"
                style={{ color: p.is_default ? '#f59e0b' : 'var(--ap-text-4)' }}
              >
                <Star size={16} fill={p.is_default ? '#f59e0b' : 'none'} />
              </button>
              {canManage && (
                <button type="button" title="Remover" onClick={() => removePair(i)} className="p-1.5 rounded text-red-500">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          {canManage && (
            <div className="flex items-center justify-between pt-2">
              <button type="button" className="btn-secondary" onClick={addPair}>
                <Plus size={14} /> Adicionar par
              </button>
              <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filas de setor: para onde a IA encaminha a conversa (handoff bot→fila). */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
            <Users size={16} /> Filas de setor
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Para qual fila a IA encaminha a conversa ao fim do atendimento. Crie ou renomeie as filas em WhatsApp → Equipes e Filas.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Fila de Suporte (chamados técnicos)</span>
            <select className="input text-sm w-full" value={filaSuporte} disabled={!canManage}
              onChange={(e) => setFilaSuporte(e.target.value)}>
              <option value="">— não encaminhar —</option>
              {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Fila do Financeiro (bloqueio / 2ª via)</span>
            <select className="input text-sm w-full" value={filaFinanceiro} disabled={!canManage}
              onChange={(e) => setFilaFinanceiro(e.target.value)}>
              <option value="">— não encaminhar —</option>
              {queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </label>
        </div>
        {!queues.length && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Nenhuma fila cadastrada. Crie as filas em WhatsApp → Equipes e Filas e volte aqui para mapear.
          </p>
        )}
        {canManage && (
          <div className="flex justify-end pt-1">
            <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSaveFilas} disabled={savingFilas}>
              {savingFilas ? <Loader2 size={14} className="animate-spin" /> : null} Salvar filas
            </button>
          </div>
        )}
      </div>

      {/* Envio de boletos: quantos boletos em aberto a IA manda numa mensagem. */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
            <Receipt size={16} /> Envio de boletos
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Quantos boletos em aberto a IA envia numa mensagem. Ela mostra sempre os vencidos primeiro; se houver mais, avisa e oferece enviar o restante.
          </p>
        </div>
        <label className="text-xs space-y-1 block sm:max-w-xs">
          <span style={{ color: 'var(--ap-text-3)' }}>Máximo por mensagem</span>
          <select className="input text-sm w-full" value={String(boletoMax)} disabled={!canManage}
            onChange={(e) => setBoletoMax(Number(e.target.value))}>
            <option value="1">1 boleto</option>
            <option value="2">2 boletos</option>
            <option value="3">3 boletos</option>
            <option value="5">5 boletos</option>
            <option value="10">10 boletos</option>
            <option value="0">Todos os em aberto</option>
          </select>
        </label>
        {canManage && (
          <div className="flex justify-end pt-1">
            <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSaveBoleto} disabled={savingBoleto}>
              {savingBoleto ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
            </button>
          </div>
        )}
      </div>

      {/* Link de pagamento: a IA gera um link temporário com a 2ª via (sem login). */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
            <Link2 size={16} /> Link de pagamento
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            A IA gera um link temporário com a 2ª via para o cliente pagar sem login. Escolha por quanto tempo o link vale e informe o endereço público do sistema (onde a página de pagamento abre).
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Validade do link</span>
            <select className="input text-sm w-full" value={String(pagTtl)} disabled={!canManage}
              onChange={(e) => setPagTtl(Number(e.target.value))}>
              <option value="1">1 hora</option>
              <option value="6">6 horas</option>
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
            </select>
          </label>
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Endereço público do sistema</span>
            <input className="input text-sm w-full" value={pagBaseUrl} disabled={!canManage}
              placeholder="https://seu-dominio.com.br"
              onChange={(e) => setPagBaseUrl(e.target.value)} />
          </label>
        </div>
        {!pagBaseUrl && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Sem o endereço público, a IA não consegue gerar o link (ela avisa e manda a linha digitável direto).
          </p>
        )}
        {canManage && (
          <div className="flex justify-end pt-1">
            <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSavePag} disabled={savingPag}>
              {savingPag ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
            </button>
          </div>
        )}
      </div>

      {/* Equipe de plantão: quem é avisado por WhatsApp quando a IA detecta uma
          anomalia de rede sem incidente cadastrado. */}
      <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-surface)' }}>
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--ap-text-1)' }}>
            <BellRing size={16} /> Equipe de plantão (alerta de incidente)
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Quando a IA identifica uma instabilidade na região de um cliente sem incidente cadastrado, ela avisa a equipe por WhatsApp
            e abre um rascunho de incidente para vocês tratarem. Recebem o aviso os membros desta equipe com telefone cadastrado e o
            aviso ligado (em WhatsApp → Equipes e Filas). O modelo nunca escolhe quem recebe — vem daqui.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Equipe responsável</span>
            <select className="input text-sm w-full" value={plantao.team_id} disabled={!canManage}
              onChange={(e) => setPlantao((p) => ({ ...p, team_id: e.target.value }))}>
              <option value="">— não avisar —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Considerar anomalia a partir de (% da região offline)</span>
            <select className="input text-sm w-full" value={String(plantao.limiar_pct)} disabled={!canManage}
              onChange={(e) => setPlantao((p) => ({ ...p, limiar_pct: Number(e.target.value) }))}>
              <option value="20">20%</option>
              <option value="30">30%</option>
              <option value="40">40%</option>
              <option value="50">50%</option>
              <option value="60">60%</option>
              <option value="70">70%</option>
            </select>
          </label>
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Modelo de mensagem aprovado (WhatsApp)</span>
            <input className="input text-sm w-full" value={plantao.template} disabled={!canManage}
              placeholder="nome_do_template_aprovado"
              onChange={(e) => setPlantao((p) => ({ ...p, template: e.target.value }))} />
          </label>
          <label className="text-xs space-y-1 block">
            <span style={{ color: 'var(--ap-text-3)' }}>Intervalo mínimo entre avisos (minutos)</span>
            <select className="input text-sm w-full" value={String(plantao.cooldown_min)} disabled={!canManage}
              onChange={(e) => setPlantao((p) => ({ ...p, cooldown_min: Number(e.target.value) }))}>
              <option value="0">Sem intervalo</option>
              <option value="30">30 minutos</option>
              <option value="60">1 hora</option>
              <option value="120">2 horas</option>
              <option value="240">4 horas</option>
            </select>
          </label>
        </div>
        {!plantao.template && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            Sem um modelo aprovado, o aviso fora da janela de 24h não sai pela Meta — a equipe recebe o alerta interno no sistema como reserva.
          </p>
        )}
        {canManage && (
          <div className="flex justify-end pt-1">
            <button type="button" className="btn-primary disabled:opacity-60" onClick={handleSavePlantao} disabled={savingPlantao}>
              {savingPlantao ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
