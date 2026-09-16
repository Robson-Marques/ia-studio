import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, EmptyState, Spinner, Modal, Field, Select, useToast, DSIcon } from '@studio-ux-ds/react';
import { listAttendanceAnalyses, analyzeAttendanceChat } from '../../services/ai';
import { listChats } from '../../services/whatsapp';
import { usePermissions } from '../../hooks/usePermissions';

// IA Studio › Análise de atendimento (Checkpoint 1b). Porte do "Aprendizados" do
// Aquapark, genérico: sob pedido, a IA analisa uma conversa e devolve melhorias
// para a IA e para a equipe. Não envia nada ao cliente nem altera o atendimento.
//
// DS: usa só componentes já presentes no painel (sem PageHeader/Combobox, que
// este DS não exporta). O cabeçalho é montado à mão com os tokens `--su-*`.

function targetMeta(target) {
  if (target === 'AI') return { label: 'Melhoria da IA', tone: 'info' };
  if (target === 'HUMAN') return { label: 'Melhoria da equipe', tone: 'warning' };
  return { label: 'Registro', tone: 'neutral' };
}

function chatLabel(chat) {
  const nome = chat.contact_name || 'Contato sem nome';
  const fone = chat.phone || 'sem telefone';
  return `${nome} · ${fone}`;
}

export default function AnaliseAtendimento() {
  const toast = useToast();
  const { can } = usePermissions();
  const canRun = can('ai.analysis.run');

  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatId, setChatId] = useState('');
  const [analisando, setAnalisando] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await listAttendanceAnalyses());
    } catch (err) {
      toast.error(err.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Conversas para o seletor — carrega ao abrir o modal (as mais recentes).
  useEffect(() => {
    if (!modalOpen) return undefined;
    let vivo = true;
    setLoadingChats(true);
    listChats({ take: 200 })
      .then(({ items: list }) => { if (vivo) setChats(Array.isArray(list) ? list : []); })
      .catch((err) => { if (vivo) toast.error(err.message); })
      .finally(() => { if (vivo) setLoadingChats(false); });
    return () => { vivo = false; };
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirModal() {
    setChatId('');
    setModalOpen(true);
  }

  async function analisar() {
    if (!chatId || analisando) return;
    setAnalisando(true);
    try {
      const result = await analyzeAttendanceChat(chatId);
      const total = Array.isArray(result?.suggestions) ? result.suggestions.length : 0;
      toast.success(total
        ? `${total} ${total === 1 ? 'melhoria identificada.' : 'melhorias identificadas.'}`
        : 'Análise concluída sem melhorias a registrar.');
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAnalisando(false);
    }
  }

  // Agrupa as sugestões por execução (analysis_trace_id).
  const analises = useMemo(() => {
    const porTrace = new Map();
    for (const item of items || []) {
      const trace = item.analysis_trace_id || `registro:${item.id}`;
      const atual = porTrace.get(trace) || {
        id: trace,
        chat: item.chat,
        createdAt: item.analyzed_at || item.created_at,
        itens: [],
      };
      atual.itens.push(item);
      porTrace.set(trace, atual);
    }
    return [...porTrace.values()];
  }, [items]);

  return (
    <div className="su-screen">
      <div
        className="flex items-start justify-between gap-3 flex-wrap"
        style={{ marginBottom: 'var(--su-space-4)' }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            Análise de atendimento
          </h1>
          <p style={{ fontSize: 13, margin: '4px 0 0', maxWidth: 640, color: 'var(--su-text-muted)' }}>
            Escolha uma conversa para receber um diagnóstico de melhorias — para a IA e para a equipe. A análise roda só
            quando você pede e não altera o atendimento.
          </p>
        </div>
        {canRun && (
          <Button variant="primary" icon="bot" onClick={abrirModal}>Analisar conversa</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : analises.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma análise ainda"
          description="Escolha uma conversa para obter um diagnóstico de melhorias para a IA e para a equipe."
          action={canRun ? <Button icon="bot" onClick={abrirModal}>Analisar conversa</Button> : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--su-space-3)' }}>
          {analises.map((a) => (
            <Card key={a.id}>
              <div style={{ padding: 20 }}>
                <div className="flex items-start gap-3">
                  <DSIcon name="search" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: 'var(--su-text-primary)' }}>
                      {a.chat?.contact_name ? `Análise de ${a.chat.contact_name}` : 'Análise de atendimento'}
                    </strong>
                    <p style={{ fontSize: 12, margin: '2px 0 12px', color: 'var(--su-text-muted)' }}>
                      {a.createdAt ? new Date(a.createdAt).toLocaleString('pt-BR') : ''}
                    </p>
                    <div style={{ display: 'grid', gap: 'var(--su-space-3)' }}>
                      {a.itens.map((item) => {
                        const meta = targetMeta(item.improvement_target);
                        return (
                          <div key={item.id}>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <p style={{ margin: '6px 0 0', color: 'var(--su-text-primary)' }}>{item.content}</p>
                            {item.evidence && (
                              <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--su-text-muted)' }}>
                                Sinal observado: {item.evidence}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={analisando ? undefined : () => setModalOpen(false)}
        title="Analisar conversa"
        maxWidth={560}
        footer={
          <>
            <Button variant="secondary" disabled={analisando} onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" icon="bot" loading={analisando} disabled={!chatId || loadingChats} onClick={analisar}>
              Executar análise
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-muted)' }}>
            A análise acontece só agora, nesta conversa. Ela não envia mensagens nem altera a IA ou o atendimento
            automaticamente. Requer uma conexão de IA ativa.
          </p>
          <Field
            label="Conversa"
            hint={loadingChats
              ? 'Carregando conversas…'
              : chats.length ? 'Escolha a conversa que deve ser revisada.' : 'Nenhuma conversa disponível neste ambiente.'}
          >
            <Select value={chatId} onChange={(e) => setChatId(e.target.value)} disabled={loadingChats || analisando}>
              <option value="">{loadingChats ? 'Carregando…' : 'Selecione uma conversa'}</option>
              {chats.map((c) => <option key={c.id} value={c.id}>{chatLabel(c)}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
