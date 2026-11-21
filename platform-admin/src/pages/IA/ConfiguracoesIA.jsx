import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@studio-ux-ds/react';
import { ensureNativeAgent, listAgents, getAgent, updateAgent } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';
import './configuracoes-ia.css';

// Tela-piloto da modernização Studio Workflow: composição local, sem widgets
// volumosos do Studio UX. Configurações internas e ferramentas não são editáveis
// pelo operador. Auto-reply depende do canal conectado e do backend.
const DEPTH = [
  { value: 4, label: 'Objetivo' },
  { value: 6, label: 'Equilibrado' },
  { value: 10, label: 'Detalhado' },
];

export default function ConfiguracoesIA() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canWrite = can('ai.agents.write');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [tone, setTone] = useState('amigável');
  const [emojis, setEmojis] = useState('none');
  const [brevity, setBrevity] = useState('medium');
  const [depth, setDepth] = useState(6);
  const [automatic, setAutomatic] = useState(false);
  const [delay, setDelay] = useState(12);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const record = canWrite
          ? await ensureNativeAgent()
          : await listAgents().then(({ items }) =>
              items.find((item) => item.name === 'Assistente Newnet') ||
              (items.length === 1 ? items[0] : null));
        if (!record) { if (active) setError('Agente oficial ainda não configurado.'); return; }
        const full = await getAgent(record.id);
        if (!active) return;
        setAgent(full);
        setName(full.persona?.name || '');
        setTone(full.persona?.tone || 'amigável');
        setEmojis(full.persona?.emojis === true ? 'moderate' : 'none');
        setBrevity(full.persona?.brevity || 'medium');
        setDepth(full.max_steps || 6);
        setAutomatic(full.conversation?.auto_reply === true);
        setDelay(full.conversation?.debounce_seconds ?? 12);
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [canWrite]);

  async function save() {
    if (!agent || !canWrite) return;
    setSaving(true);
    try {
      const updated = await updateAgent(agent.id, {
        persona: { ...(agent.persona || {}), name: name.trim(), tone,
          emojis: emojis === 'moderate', brevity },
        max_steps: Number(depth),
        conversation: { ...(agent.conversation || {}), auto_reply: automatic,
          debounce_seconds: Math.min(120, Math.max(1, Number(delay) || 12)),
          split_paragraphs: false },
      });
      setAgent(updated);
      toast.success('Configurações da IA salvas.');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  function openConnectChat() {
    if (!agent || !can('comm.connectchat.read')) return;
    navigate('/connectchat/conversas');
  }

  const disabled = !canWrite || saving;
  return (
    <main className="newnet-ai" aria-busy={loading || saving}>
      <header className="newnet-ai__header">
        <div>
          <h1>Configurações da IA</h1>
          <p>Identidade e comportamento do atendimento Newnet.</p>
        </div>
        <button type="button" className="newnet-ai__primary" onClick={save}
          disabled={!agent || disabled}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
      </header>
      {loading ? <p role="status">Carregando configurações…</p> : error ? (
        <p role="alert" className="newnet-ai__error">{error}</p>
      ) : !agent ? <p role="alert">O agente oficial não está disponível.</p> : (
        <>
          <div className="newnet-ai__grid">
            <section className="newnet-ai__section" aria-labelledby="ai-identidade">
              <div className="newnet-ai__section-title">
                <h2 id="ai-identidade">Identidade</h2>
                <span className="newnet-ai__status">{agent.is_active ? 'Disponível' : 'Desativado'}</span>
              </div>
              <div className="newnet-ai__fields">
                <label>Nome de atendimento
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Nete" maxLength={120} disabled={disabled} />
                </label>
                <label>Tom de voz
                  <select value={tone} onChange={(e) => setTone(e.target.value)} disabled={disabled}>
                    <option value="amigável">Amigável</option>
                    <option value="formal">Formal</option>
                    <option value="informal">Informal</option>
                    <option value="técnica">Técnico</option>
                  </select>
                </label>
                <label>Emojis
                  <select value={emojis} onChange={(e) => setEmojis(e.target.value)} disabled={disabled}>
                    <option value="none">Não usar</option>
                    <option value="moderate">Moderados</option>
                  </select>
                </label>
                <label>Respostas
                  <select value={brevity} onChange={(e) => setBrevity(e.target.value)} disabled={disabled}>
                    <option value="short">Curtas</option>
                    <option value="medium">Equilibradas</option>
                    <option value="long">Detalhadas</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="newnet-ai__section" aria-labelledby="ai-atendimento">
              <div className="newnet-ai__section-title"><h2 id="ai-atendimento">Atendimento</h2></div>
              <div className="newnet-ai__fields">
                <label>Profundidade
                  <select value={depth} onChange={(e) => setDepth(Number(e.target.value))} disabled={disabled}>
                    {DEPTH.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                    {!DEPTH.some((entry) => entry.value === Number(depth)) &&
                      <option value={depth}>{depth} etapas (atual)</option>}
                  </select>
                </label>
                <label>Espera antes de responder
                  <div className="newnet-ai__number">
                    <input type="number" min="1" max="120" step="1" value={delay}
                      onChange={(e) => setDelay(e.target.value)} disabled={disabled} />
                    <span>segundos</span>
                  </div>
                </label>
              </div>
              <label className="newnet-ai__toggle">
                <input type="checkbox" checked={automatic}
                  onChange={(e) => setAutomatic(e.target.checked)} disabled={disabled} />
                <span>Responder automaticamente às mensagens recebidas</span>
              </label>
              <p className="newnet-ai__note">
                Uma resposta por mensagem, com parágrafos na mesma bolha.
                O envio automático exige o canal habilitado.
              </p>
            </section>
          </div>
          <section className="newnet-ai__channels" aria-labelledby="ai-canais">
            <div className="newnet-ai__channel-text">
              <h2 id="ai-canais">Conhecimento e canais</h2>
              <p>Informações extras na base de conhecimento. Ações técnicas continuam internas.</p>
            </div>
            <div className="newnet-ai__channel-actions">
              {can('ai.knowledge.read') && (
                <button type="button" onClick={() => navigate('/ia/conhecimento')}>Conhecimento</button>
              )}
              {can('comm.connectchat.read') && (
                <button type="button" className="newnet-ai__primary" onClick={openConnectChat}
                  >Abrir ConnectChat</button>
              )}
              <span className="newnet-ai__pending">WhatsApp · depois dos testes</span>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
