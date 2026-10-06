import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, useToast } from '@studio-ux-ds/react';
import { listConnectchatConversations, listConnectchatMessages, markConnectchatRead, sendConnectchatMessage } from '../../services/connectchat';
import { usePermissions } from '../../hooks/usePermissions';

const POLL_MS = 5000;

function labelForConversation(conversation) {
  return `Cliente ${conversation.businessContactId.slice(0, 8)}`;
}

function messageId() {
  return globalThis.crypto?.randomUUID?.() ?? `ystudio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => Number(a.serverSequence) - Number(b.serverSequence));
}

export default function ConnectchatConversas() {
  const toast = useToast();
  const { can } = usePermissions();
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const selectedRef = useRef(null);
  const messagesRef = useRef([]);
  selectedRef.current = selected;
  messagesRef.current = messages;

  const loadConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const items = await listConnectchatConversations();
      setConversations(items);
      const current = selectedRef.current;
      if (current && !items.some((item) => item.id === current.id)) {
        setSelected(null);
        setMessages([]);
      }
    } catch (error) {
      if (!silent) toast.error(error.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const loadMessages = useCallback(async (conversation, initial = false, silent = false) => {
    try {
      const afterSequence = initial
        ? '0'
        : (messagesRef.current.at(-1)?.serverSequence ?? '0');
      const incoming = await listConnectchatMessages(conversation.id, afterSequence);
      if (selectedRef.current?.id !== conversation.id) return;
      setMessages((current) => mergeMessages(initial ? [] : current, incoming));
      const lastSequence = incoming.at(-1)?.serverSequence ?? (initial ? undefined : afterSequence);
      if (lastSequence && lastSequence !== '0' && can('comm.connectchat.write')) {
        markConnectchatRead(conversation.id, lastSequence);
      }
    } catch (error) {
      if (!silent) toast.error(error.message);
    }
  }, [can, toast]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations(true);
      const current = selectedRef.current;
      if (current) loadMessages(current, false, true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadConversations, loadMessages]);

  async function selectConversation(conversation) {
    setSelected(conversation);
    setMessages([]);
    await loadMessages(conversation, true);
  }

  async function send() {
    const body = text.trim();
    if (!body || !selected) return;
    setSending(true);
    const stableClientMessageId = messageId();
    try {
      const sent = await sendConnectchatMessage(selected.id, body, stableClientMessageId);
      setMessages((current) => mergeMessages(current, [sent]));
      setText('');
      await loadConversations(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex overflow-hidden" style={{ flex: 1, minHeight: 0, background: 'var(--su-surface-overlay)' }}>
      <aside className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 shrink-0 min-h-0`} style={{ borderRight: '1px solid var(--su-border-default)' }}>
        <div style={{ padding: 'var(--su-space-4)', borderBottom: '1px solid var(--su-border-default)' }}>
          <h1 style={{ margin: 0, fontSize: 16, color: 'var(--su-text-primary)' }}>Conversas internas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--su-text-muted)' }}>ConnectChat</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <p style={{ padding: 'var(--su-space-4)', color: 'var(--su-text-muted)' }}>Carregando conversas…</p> : null}
          {!loading && conversations.length === 0 ? (
            <EmptyState icon="message" title="Nenhuma conversa" description="Quando um cliente iniciar o atendimento no ConnectChat, ela aparecerá aqui." />
          ) : conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => selectConversation(conversation)}
              className="w-full text-left"
              style={{ padding: 'var(--su-space-3) var(--su-space-4)', borderBottom: '1px solid var(--su-border-subtle)', background: selected?.id === conversation.id ? 'var(--su-action-tint)' : 'transparent' }}
            >
              <div className="flex items-center justify-between gap-2">
                <strong style={{ fontSize: 13, color: 'var(--su-text-primary)' }}>{labelForConversation(conversation)}</strong>
                <Badge tone={conversation.status === 'OPEN' ? 'success' : 'neutral'}>{conversation.status === 'OPEN' ? 'Aberta' : 'Encerrada'}</Badge>
              </div>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--su-text-muted)' }}>Atividade #{conversation.lastSequence}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className={`${selected ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
        {selected ? (
          <>
            <header className="flex items-center justify-between gap-3" style={{ padding: 'var(--su-space-3) var(--su-space-4)', borderBottom: '1px solid var(--su-border-default)' }}>
              <div>
                <strong style={{ color: 'var(--su-text-primary)' }}>{labelForConversation(selected)}</strong>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--su-text-muted)' }}>Identificador: {selected.businessContactId}</span>
              </div>
              <div className="md:hidden"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Voltar</Button></div>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2" style={{ padding: 'var(--su-space-4)', background: 'var(--su-surface-subtle)' }}>
              {messages.length === 0 ? <EmptyState icon="message" title="Sem mensagens" description="Ainda não há mensagens para mostrar nesta conversa." /> : messages.map((message) => {
                const outgoing = message.senderKind === 'BUSINESS';
                return (
                  <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    <div style={{ maxWidth: '80%', padding: 'var(--su-space-3)', borderRadius: 'var(--su-radius-md)', background: outgoing ? 'var(--su-action)' : 'var(--su-surface-raised)', color: outgoing ? 'var(--su-action-contrast)' : 'var(--su-text-primary)', boxShadow: 'var(--su-shadow-sm)' }}>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{message.body}</p>
                      <span style={{ display: 'block', marginTop: 4, fontSize: 10, opacity: 0.72 }}>{new Date(message.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {selected.status === 'OPEN' && can('comm.connectchat.write') ? (
              <div className="flex gap-2" style={{ padding: 'var(--su-space-3)', borderTop: '1px solid var(--su-border-default)' }}>
                <textarea className="su-textarea" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Mensagem" disabled={sending} style={{ flex: 1, minHeight: 42, resize: 'none' }} />
                <Button variant="primary" loading={sending} disabled={!text.trim()} onClick={send}>Enviar</Button>
              </div>
            ) : (
              <p style={{ margin: 0, padding: 'var(--su-space-3)', textAlign: 'center', color: 'var(--su-text-muted)', borderTop: '1px solid var(--su-border-default)' }}>{selected.status === 'CLOSED' ? 'Esta conversa foi encerrada no ConnectChat.' : 'Você não tem permissão para responder.'}</p>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center"><EmptyState icon="message" title="Escolha uma conversa" description="Selecione uma conversa do ConnectChat para atender." /></div>
        )}
      </main>
    </div>
  );
}
