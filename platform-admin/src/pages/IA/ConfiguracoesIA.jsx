import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen, PageHeader, Card, Field, Input, Select, NumericInput, Button, Badge, Spinner, useToast } from '@studio-ux-ds/react';
import { ensureNativeAgent, listAgents, getAgent, updateAgent } from '../../services/ai';
import { usePermissions } from '../../hooks/usePermissions';

// Configuração operacional do agente nativo. A IA e suas ferramentas são internas:
// não criar agente, escolher modelo ou alterar prompts aqui.
const DEPTH = [
  { value: 4, label: 'Objetivo — investigação breve' },
  { value: 6, label: 'Equilibrado — investigação padrão' },
  { value: 10, label: 'Detalhado — mais etapas de investigação' },
];

export default function ConfiguracoesIA() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canWrite = can('ai.agents.write');
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        if (!record) return;
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
      } catch (error) {
        if (active) toast.error(error.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!agent || !canWrite) return;
    setSaving(true);
    try {
      // Atualiza só preferências operacionais, preservando roteiro,
      // integrações, regras internas, vínculos, tools e memória preexistentes.
      const updated = await updateAgent(agent.id, {
        persona: {
          ...(agent.persona || {}),
          name: name.trim(),
          tone,
          emojis: emojis === 'moderate',
          brevity,
        },
        max_steps: Number(depth),
        conversation: {
          ...(agent.conversation || {}),
          auto_reply: automatic,
          debounce_seconds: Math.min(120, Math.max(1, Number(delay) || 12)),
          split_paragraphs: false,
        },
      });
      setAgent(updated);
      toast.success('Configurações da IA salvas.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen as="div" className="space-y-4">
      <PageHeader title="Configurações da IA"
        subtitle="Personalize como o atendimento da Newnet se apresenta e responde. Ferramentas e regras de suporte são internas."
        actions={<Button variant="primary" onClick={save} disabled={!agent || !canWrite} loading={saving}>Salvar alterações</Button>} />
      {loading ? <Spinner size="lg" center /> : !agent ? (
        <Card><div style={{ padding: 20 }}>Não foi possível identificar o agente oficial desta instalação.</div></Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div style={{ padding: 16 }} className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <strong>Identidade do atendimento</strong>
                <Badge tone={agent.is_active ? 'success' : 'neutral'}>{agent.is_active ? 'Agente interno disponível' : 'Agente desativado'}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nome de apresentação" hint="Nome que o cliente verá na conversa.">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nina" disabled={!canWrite} />
                </Field>
                <Field label="Tom da conversa">
                  <Select value={tone} onChange={(e) => setTone(e.target.value)} disabled={!canWrite}>
                    <option value="amigável">Amigável</option>
                    <option value="formal">Formal</option>
                    <option value="informal">Informal</option>
                    <option value="técnica">Técnico</option>
                  </Select>
                </Field>
                <Field label="Emojis">
                  <Select value={emojis} onChange={(e) => setEmojis(e.target.value)} disabled={!canWrite}>
                    <option value="none">Não utilizar</option>
                    <option value="moderate">Usar com moderação</option>
                  </Select>
                </Field>
                <Field label="Tamanho das respostas">
                  <Select value={brevity} onChange={(e) => setBrevity(e.target.value)} disabled={!canWrite}>
                    <option value="short">Curtas</option>
                    <option value="medium">Equilibradas</option>
                    <option value="long">Detalhadas</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Card>
          <Card>
            <div style={{ padding: 16 }} className="space-y-3">
              <strong>Profundidade do atendimento</strong>
              <Field label="Nível de investigação"
                hint="Define o limite de etapas da execução de IA. Não substitui as regras internas do diagnóstico.">
                <Select value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))} disabled={!canWrite}>
                  {DEPTH.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  {!DEPTH.some((d) => d.value === Number(depth)) &&
                    <option value={depth}>{depth} etapas — configuração existente</option>}
                </Select>
              </Field>
            </div>
          </Card>
          <Card>
            <div style={{ padding: 16 }} className="space-y-3">
              <strong>Como a IA conversa</strong>
              <label className="flex items-center gap-2" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} disabled={!canWrite} />
                Atender automaticamente — responder sozinho às mensagens recebidas
              </label>
              <Field label="Esperar antes de responder (segundos)"
                hint="Agrupa mensagens próximas do mesmo cliente antes de gerar a resposta.">
                <NumericInput value={delay} min={1} max={120} step={1}
                  onChange={(v) => setDelay(v)} disabled={!canWrite} fullWidth />
              </Field>
              <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                A resposta será enviada em uma única mensagem, com quebras de linha quando necessário.
                O ConnectChat continua supervisionado durante a validação, mesmo com a preferência automática ligada.
              </p>
            </div>
          </Card>
          <Card>
            <div style={{ padding: 16 }} className="space-y-3">
              <strong>Conhecimento e canais</strong>
              <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                Informações, instruções complementares e restrições de conteúdo ficam na base de conhecimento.
                Autorizações para executar ações continuam protegidas no sistema.
              </p>
              <div className="flex flex-wrap gap-2">
                {can('ai.knowledge.read') &&
                  <Button variant="secondary" onClick={() => navigate('/ia/conhecimento')}>Base de conhecimento</Button>}
                {can('comm.connectchat.read') &&
                  <Button variant="secondary" onClick={() => navigate('/connectchat/conversas')}>Testar no ConnectChat</Button>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--su-text-secondary)', margin: 0 }}>
                WhatsApp será conectado depois da validação do atendimento web.
              </p>
            </div>
          </Card>
        </div>
      )}
    </Screen>
  );
}
