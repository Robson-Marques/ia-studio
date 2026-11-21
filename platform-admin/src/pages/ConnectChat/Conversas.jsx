import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, useToast } from '@studio-ux-ds/react';
import { getConnectchatAttachment, getConnectchatTyping, listConnectchatConversations, listConnectchatMessages, markConnectchatDelivered, markConnectchatRead, resetConnectchatAiContext, sendConnectchatAttachment, sendConnectchatMessage, setConnectchatTyping } from '../../services/connectchat';
import { usePermissions } from '../../hooks/usePermissions';

const POLL_MS = 5000;
const TYPING_POLL_MS = 1500;

function presenceCopy(activity) {
  if (activity === 'recording_audio') return 'Cliente está gravando um áudio…';
  if (activity === 'recording_video') return 'Cliente está gravando um vídeo…';
  return 'Cliente está digitando…';
}

function labelForConversation(conversation) {
  if (conversation.customerDisplayName) return conversation.customerDisplayName;
  return conversation.businessContact?.displayName ?? 'Cliente em identificação';
}

function messageId() {
  return globalThis.crypto?.randomUUID?.() ?? `ystudio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => Number(a.serverSequence) - Number(b.serverSequence));
}

function receiptMark(message) {
  if (message.senderKind !== 'BUSINESS') return null;
  const receipt = message.receipts?.find((item) => item.participantKind === 'CUSTOMER');
  if (receipt?.readAt) return { label: 'Lida pelo cliente', color: '#42ff7a', glyph: '✓✓' };
  if (receipt?.deliveredAt) return { label: 'Entregue ao cliente', color: '#d3d8e2', glyph: '✓✓' };
  return { label: 'Enviada ao ConnectChat', color: '#d3d8e2', glyph: '✓' };
}

function attachmentKind(file) {
  if (file.type.startsWith('image/')) return 'IMAGE';
  if (file.type.startsWith('audio/')) return 'AUDIO';
  if (file.type.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}

function attachmentLabel(attachment) {
  return attachment.kind === 'AUDIO' ? 'Áudio' : attachment.kind === 'VIDEO' ? 'Vídeo' : attachment.kind === 'IMAGE' ? 'Imagem' : 'Documento';
}

function MessageAttachment({ attachment }) {
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let url = '';
    getConnectchatAttachment(attachment.id)
      .then((content) => {
        url = content.url;
        if (alive) setAsset(content);
        else URL.revokeObjectURL(content.url);
      })
      .catch((err) => { if (alive) setError(err.message); });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id]);

  if (error) return <p style={{ margin: 'var(--su-space-2) 0 0', fontSize: 12, color: 'var(--su-text-muted)' }}>Não foi possível abrir {attachmentLabel(attachment).toLowerCase()}.</p>;
  if (!asset) return <p style={{ margin: 'var(--su-space-2) 0 0', fontSize: 12, color: 'var(--su-text-muted)' }}>Carregando {attachmentLabel(attachment).toLowerCase()}…</p>;
  if (attachment.kind === 'IMAGE') return <img src={asset.url} alt={attachment.originalName} style={{ display: 'block', maxWidth: '100%', maxHeight: 320, marginTop: 'var(--su-space-2)', borderRadius: 'var(--su-radius-sm)' }} />;
  if (attachment.kind === 'VIDEO') return <video src={asset.url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 360, marginTop: 'var(--su-space-2)', borderRadius: 'var(--su-radius-sm)', background: 'var(--su-surface-overlay)' }} />;
  if (attachment.kind === 'AUDIO') return <audio src={asset.url} controls preload="metadata" style={{ display: 'block', width: '100%', marginTop: 'var(--su-space-2)' }} />;
  return <a href={asset.url} download={attachment.originalName} style={{ display: 'block', marginTop: 'var(--su-space-2)', color: 'inherit', fontSize: 13, fontWeight: 700 }}>📎 {attachment.originalName}</a>;
}

export default function ConnectchatConversas() {
  const toast = useToast();
  const { can } = usePermissions();
  const canLinkCustomer = can('comm.connectchat.link.customer');
  const canWriteChat = can('comm.connectchat.write');
  const canResetNete = can('ai.agents.write');
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [resettingNete, setResettingNete] = useState(false);
  const [customerActivity, setCustomerActivity] = useState(null);
  const selectedRef = useRef(null);
  const messagesRef = useRef([]);
  const typingTimerRef = useRef(null);
  const typingHeartbeatRef = useRef(null);
  const typingConversationRef = useRef(null);
  const attachmentInputRef = useRef(null);
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
      } else if (current) {
        setSelected(items.find((item) => item.id === current.id) ?? current);
      }
    } catch (error) {
      if (!silent) toast.error(error.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const loadMessages = useCallback(async (conversation, initial = false, silent = false) => {
    try {
      const lastKnown = messagesRef.current.at(-1)?.serverSequence ?? '0';
      const afterSequence = initial ? '0' : (BigInt(lastKnown) > 100n ? (BigInt(lastKnown) - 100n).toString() : '0');
      const incoming = await listConnectchatMessages(conversation.id, afterSequence);
      if (selectedRef.current?.id !== conversation.id) return;
      setMessages((current) => mergeMessages(initial ? [] : current, incoming));
      const lastSequence = incoming.at(-1)?.serverSequence ?? (initial ? undefined : afterSequence);
      if (lastSequence && lastSequence !== '0' && canWriteChat) {
        void markConnectchatDelivered(conversation.id, lastSequence).then(() => markConnectchatRead(conversation.id, lastSequence));
      }
    } catch (error) {
      if (!silent) toast.error(error.message);
    }
  }, [canWriteChat, toast]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations(true);
      const current = selectedRef.current;
      if (current) loadMessages(current, false, true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (!selected?.id) {
      setCustomerActivity(null);
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      try {
        const presence = await getConnectchatTyping(selected.id);
        if (active) setCustomerActivity(presence.customerTyping ? (presence.customerActivity || 'typing') : null);
      } catch (error) {
        console.warn('Não foi possível consultar a digitação do cliente no ConnectChat.', error);
        if (active) setCustomerActivity(null);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), TYPING_POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, [selected?.id]);

  function stopTyping(conversationId = typingConversationRef.current) {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (typingHeartbeatRef.current) clearInterval(typingHeartbeatRef.current);
    typingHeartbeatRef.current = null;
    if (!conversationId) return;
    typingConversationRef.current = null;
    void setConnectchatTyping(conversationId, 'stopped').catch(() => undefined);
  }

  function scheduleTyping() {
    const conversation = selectedRef.current;
    if (!conversation) return;
    if (typingConversationRef.current && typingConversationRef.current !== conversation.id) stopTyping(typingConversationRef.current);
    if (!typingConversationRef.current) {
      typingConversationRef.current = conversation.id;
      void setConnectchatTyping(conversation.id, 'started').catch(() => undefined);
      typingHeartbeatRef.current = setInterval(() => {
        if (typingConversationRef.current === conversation.id) void setConnectchatTyping(conversation.id, 'started').catch(() => undefined);
      }, 1_000);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => stopTyping(conversation.id), 2_500);
  }

  useEffect(() => () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (typingHeartbeatRef.current) clearInterval(typingHeartbeatRef.current);
    const conversationId = typingConversationRef.current;
    if (conversationId) void setConnectchatTyping(conversationId, 'stopped').catch(() => undefined);
  }, []);

  async function selectConversation(conversation) {
    stopTyping();
    setSelected(conversation);
    setMessages([]);
    setCustomerActivity(null);
    await loadMessages(conversation, true);
  }

  async function resetNete() {
    if (!selected || resettingNete) return;
    if (!window.confirm('Reiniciar o contexto da Nete nesta conversa? A próxima mensagem será tratada como um atendimento novo. As mensagens antigas permanecerão no ConnectChat.')) return;
    setResettingNete(true);
    try {
      await resetConnectchatAiContext(selected.id);
      toast.success('Contexto da Nete reiniciado. A próxima mensagem inicia uma nova interação.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setResettingNete(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || !selected) return;
    stopTyping(selected.id);
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

  async function sendAttachment(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error('O arquivo pode ter no máximo 100 MB.');
      return;
    }
    stopTyping(selected.id);
    setSendingAttachment(true);
    try {
      const sent = await sendConnectchatAttachment(selected.id, file, attachmentKind(file), messageId());
      setMessages((current) => mergeMessages(current, [sent]));
      await loadConversations(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSendingAttachment(false);
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
                <span style={{ display: 'block', fontSize: 11, color: 'var(--su-text-muted)' }}>
                  {selected.businessContact?.status === 'CUSTOMER'
                    ? `Conta ConnectChat: ${selected.businessContact?.displayName ?? 'não informada'}`
                    : 'Cliente em identificação'}
                </span>
                {selected.businessContact?.status === 'CUSTOMER' ? <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--su-text-muted)' }}>Cliente vinculado</span> : null}
              </div>
              <div className="flex items-center gap-2">
                {canResetNete ? <Button variant="secondary" size="sm" loading={resettingNete} onClick={resetNete}>Reiniciar Nete</Button> : null}
                <div className="md:hidden"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Voltar</Button></div>
              </div>
            </header>
            <div style={{ padding: '6px 14px', fontSize: 12, borderBottom: '1px solid var(--su-border-default)', color: 'var(--su-text-secondary)' }}>
              IA Newnet integrada ao ConnectChat · As mensagens recebem resposta automaticamente quando a opção está ligada em Configurações da IA.
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2" style={{ padding: 'var(--su-space-4)', background: 'var(--su-surface-subtle)' }}>
              {messages.length === 0 ? <EmptyState icon="message" title="Sem mensagens" description="Ainda não há mensagens para mostrar nesta conversa." /> : messages.map((message) => {
                const outgoing = message.senderKind === 'BUSINESS';
                const receipt = receiptMark(message);
                return (
                  <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                    <div style={{ maxWidth: '80%', padding: 'var(--su-space-3)', borderRadius: 'var(--su-radius-md)', background: outgoing ? 'var(--su-action)' : 'var(--su-surface-raised)', color: outgoing ? 'var(--su-action-contrast)' : 'var(--su-text-primary)', boxShadow: 'var(--su-shadow-sm)' }}>
                      {message.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{message.body}</p> : null}
                      {message.attachments?.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
                      <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, opacity: 0.82 }}>
                        <time>{new Date(message.createdAt).toLocaleString('pt-BR')}</time>
                        {receipt ? <span aria-label={receipt.label} title={receipt.label} style={{ color: receipt.color, fontSize: 12, fontWeight: 800, letterSpacing: -2, textShadow: receipt.label === 'Lida pelo cliente' ? '0 0 8px rgba(66, 255, 122, .45)' : undefined }}>{receipt.glyph}</span> : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {selected.status === 'OPEN' && can('comm.connectchat.write') ? (
              <>
              {customerActivity ? <p style={{ margin: 0, padding: 'var(--su-space-2) var(--su-space-3) 0', color: 'var(--su-text-muted)', fontSize: 12 }}>{presenceCopy(customerActivity)}</p> : null}
              <div className="flex gap-2" style={{ padding: 'var(--su-space-3)', borderTop: '1px solid var(--su-border-default)' }}>
                <input ref={attachmentInputRef} type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" hidden onChange={sendAttachment} />
                <Button variant="secondary" size="sm" loading={sendingAttachment} disabled={sending || sendingAttachment} onClick={() => attachmentInputRef.current?.click()}>Anexar</Button>
                <textarea className="su-textarea" value={text} onChange={(event) => { const value = event.target.value; setText(value); if (value.trim()) scheduleTyping(); else stopTyping(selected.id); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Mensagem" disabled={sending || sendingAttachment} style={{ flex: 1, minHeight: 42, resize: 'none' }} />
                <Button variant="primary" loading={sending} disabled={!text.trim() || sendingAttachment} onClick={send}>Enviar</Button>
              </div>
              </>
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
