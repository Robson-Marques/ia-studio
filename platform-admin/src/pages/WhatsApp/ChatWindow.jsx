import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, IconButton, Avatar, ConfirmDialog, useToast, Spinner, DSIcon } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import {
  claimChat, releaseChat, closeChat, reopenChat, downloadChatMedia, unlinkCustomer,
} from '../../services/whatsapp';
import { ATTENDANCE_STATUS, contactInitials, formatPhone } from './whatsapp.constants';
import MessageComposer from './MessageComposer';
import AudioPlayer from './AudioPlayer';
import { statusToTone } from '../../lib/tone';

// WhatsApp/ChatWindow — a conversa aberta. Migrada pro DS na v0.10.9.
//
// **As cores da CONVERSA ficaram fixas, de propósito** — balão verde à direita,
// branco à esquerda, fundo bege, tique azul de "lido". Não é sobra do padrão
// antigo: é a convenção do WhatsApp, e o atendente passa o dia olhando o aplicativo
// de verdade. Tematizar o balão faria a mesma mensagem ter cor diferente aqui e
// lá, e o ganho seria só coerência interna.
// O que FOI tematizado é tudo em volta — cabeçalho, ações, situação, avatar —,
// que é interface do painel, não do WhatsApp.
// Consequência conhecida: no tema escuro a área da conversa continua clara. Está
// registrado na dívida técnica para o Robson decidir (imitar o WhatsApp escuro ou
// tematizar o balão).

// Tiques de status — sempre sobre balão claro, por isso a cor é fixa.
function StatusTicks({ status }) {
  if (status === 'read') return <DSIcon name="check-double" size="sm" style={{ color: '#53bdeb' }} />;
  if (status === 'delivered') return <DSIcon name="check-double" size="sm" style={{ color: '#8696a0' }} />;
  if (status === 'sent') return <DSIcon name="check" size="sm" style={{ color: '#8696a0' }} />;
  if (status === 'failed') return <DSIcon name="alert-triangle" size="sm" style={{ color: '#dc2626' }} />;
  return <DSIcon name="clock" size="sm" style={{ color: '#8696a0' }} />;
}

// Mídia da Central: baixa sob demanda pelo proxy autenticado do backend.
function ChatMedia({ chatId, message }) {
  const toast = useToast();
  const media = message.media || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const targetRef = useRef(null);

  useEffect(() => () => {
    if (data?.src) URL.revokeObjectURL(data.src);
  }, [data?.src]);

  async function load() {
    if (!media.media_id || loading || data) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await downloadChatMedia(chatId, media.media_id);
      setData({ src: URL.createObjectURL(blob), mime: blob.type });
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Porte do comportamento validado no Control Leads: imagem/figurinha/áudio
  // carregam sob demanda assim que entram na área visível, sem exigir clique.
  useEffect(() => {
    if (data || loading || error || !media.media_id || !['image', 'sticker', 'audio'].includes(message.type)) return undefined;
    const element = targetRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === 'undefined') { load(); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [chatId, media.media_id, message.type, data, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps

  const NOME_TIPO = { image: 'imagem', audio: 'áudio', video: 'vídeo' };

  if (!data) {
    return (
      <button
        ref={targetRef}
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5"
        style={{ fontSize: 12, color: '#027eb5', minHeight: 32, background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
      >
        {loading ? <Spinner size="sm" /> : <DSIcon name="download" size="sm" />}
        {error ? 'Tentar novamente' : message.media_state === 'UNAVAILABLE' ? 'Tentar carregar mídia indisponível' : `Carregar ${NOME_TIPO[message.type] || 'arquivo'}`}
      </button>
    );
  }

  const mime = data.mime || media.mime_type || '';
  if (message.type === 'image' || message.type === 'sticker' || mime.startsWith('image/')) {
    return <img src={data.src} alt="Imagem recebida na conversa" className="rounded-lg max-w-full max-h-64" />;
  }
  if (message.type === 'audio' || mime.startsWith('audio/')) {
    // Player próprio: resolve a duração de opus/blob da Meta, que o <audio>
    // nativo não consegue. `light` = variante para balão claro.
    return <AudioPlayer src={data.src} light />;
  }
  if (message.type === 'video' || mime.startsWith('video/')) {
    return <video controls src={data.src} className="rounded-lg max-w-full max-h-64" />;
  }
  const filename = media.filename || 'Documento';
  const isPdf = mime.split(';')[0].trim().toLowerCase() === 'application/pdf'
    || (/\.pdf$/i.test(filename) && (!mime || mime === 'application/octet-stream'));
  return (
    <div className="w-[260px] max-w-full overflow-hidden rounded-lg border border-black/10 bg-white/80">
      {isPdf && (
        <div className="relative h-[180px] overflow-hidden bg-white" title="Prévia da primeira página do PDF">
          <iframe
            title={`Prévia de ${filename}`}
            src={`${data.src}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            className="h-full w-full border-0"
            style={{ pointerEvents: 'none' }}
            tabIndex={-1}
            loading="lazy"
          />
        </div>
      )}
      <div className="flex items-center gap-2 p-2.5">
        <DSIcon name="file-text" size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs" title={filename}>{filename}</span>
        <a
          href={data.src}
          download={filename}
          aria-label={`Baixar ${filename}`}
          title="Baixar documento"
          style={{ color: '#027eb5' }}
        >
          <DSIcon name="download" size="sm" />
        </a>
      </div>
    </div>
  );
}

function Bubble({ chatId, message, reactions }) {
  const outgoing = message.direction === 'OUTGOING';
  return (
    <div className={outgoing ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className="relative max-w-[80%] md:max-w-[65%] rounded-lg px-2.5 py-1.5 text-sm space-y-1"
        style={{
          backgroundColor: outgoing ? '#d9fdd3' : '#ffffff',
          color: '#111b21',
          boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
          marginBottom: reactions?.length ? 13 : 0,
        }}
      >
        {(message.media && (message.media.media_id || message.media.url)) && (
          message.media.media_id
            ? <ChatMedia chatId={chatId} message={message} />
            : (message.media.url && (
              <a
                href={message.media.url}
                target="_blank"
                rel="noreferrer"
                className="break-all"
                style={{ fontSize: 12, color: '#027eb5', textDecoration: 'underline' }}
              >
                {message.media.url}
              </a>
            ))
        )}
        {message.reply_to_message_id && <p className="text-xs opacity-70">↳ Resposta a {message.reply_to_from || 'outra mensagem'}</p>}
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.type === 'reaction' && message.reaction_emoji && <p>{message.reaction_emoji} · reação a uma mensagem anterior</p>}
        {message.interactive_reply && <p className="text-xs">Opção: {message.interactive_reply.title || message.interactive_reply.id || 'resposta interativa'}{message.interactive_reply.description ? ` · ${message.interactive_reply.description}` : ''}</p>}
        {message.referral && <p className="text-xs">Origem: {message.referral.headline || message.referral.source_url || 'anúncio'}{!message.referral.source_id && ' · identificação de origem indisponível'}</p>}
        {message.template?.name && <p className="text-xs">Modelo: {message.template.name}</p>}
        {message.media_metadata && <p className="text-xs opacity-70">
          {[
            message.media_metadata.size_bytes != null ? `${Math.round(message.media_metadata.size_bytes / 1024)} KB` : null,
            message.media_metadata.width_px && message.media_metadata.height_px ? `${message.media_metadata.width_px}×${message.media_metadata.height_px}` : null,
            message.media_metadata.duration_ms != null ? `${Math.round(message.media_metadata.duration_ms / 1000)} s` : null,
          ].filter(Boolean).join(' · ')}
        </p>}
        {reactions?.length > 0 && <div
          aria-label={`Reações: ${reactions.join(' ')}`}
          className={`absolute -bottom-3 z-10 flex items-center gap-0.5 rounded-full border border-black/10 bg-white px-1.5 py-0.5 shadow-sm ${outgoing ? 'right-2' : 'left-2'}`}
          style={{ fontSize: 13, lineHeight: '16px', whiteSpace: 'nowrap' }}
        >
          {reactions.map((emoji, index) => <span key={index}>{emoji}</span>)}
        </div>}
        <div className="flex items-center gap-1 justify-end" style={{ fontSize: 10, color: '#667781' }}>
          {message.type === 'template' && <span>(modelo)</span>}
          <span>{new Date(message.occurred_at || message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          {outgoing && <StatusTicks status={message.status} />}
        </div>
        {message.status === 'failed' && message.error_detail && (
          <p style={{ fontSize: 10, margin: 0, color: '#dc2626' }}>{message.error_detail}</p>
        )}
      </div>
    </div>
  );
}

export default function ChatWindow({
  chat, messages, windowInfo, templates, scope, meId,
  onRefresh, onOpenTransfer, onOpenTimeline, onSent,
}) {
  const toast = useToast();
  const { can } = usePermissions();
  const scrollRef = useRef(null);
  const [acting, setActing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.id, messages.length]);

  if (!chat) return null;
  const st = ATTENDANCE_STATUS[chat.attendance_status] || ATTENDANCE_STATUS.OPEN;
  const isMine = chat.current_handler_type === 'USER' && chat.current_handler_id === meId;
  const closed = chat.attendance_status === 'CLOSED';
  const nome = chat.contact_name || formatPhone(chat.phone);
  const reactions = new Map();
  const knownMessageIds = new Set(messages.flatMap((m) => [m.remote_message_id, m.external_id].filter(Boolean)));
  for (const message of messages) {
    if (!message.reaction_emoji || !message.reaction_to_message_id) continue;
    const target = message.reaction_to_message_id;
    reactions.set(target, [...(reactions.get(target) || []), message.reaction_emoji]);
  }

  async function run(fn, okMsg) {
    setActing(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{ padding: 'var(--su-space-2) var(--su-space-3)', borderBottom: '1px solid var(--su-border-default)' }}
      >
        <Avatar initials={contactInitials(chat.contact_name, chat.phone)} size="sm" alt="" />

        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }} className="truncate">
            {nome}
          </p>
          <p style={{ fontSize: 11, margin: 0, color: 'var(--su-text-muted)' }}>
            {formatPhone(chat.phone)}
            {chat.current_handler_name ? ` · atendido por ${chat.current_handler_name}` : ' · ninguém atendendo'}
          </p>
          {chat.linked_customer_name && (
            <p style={{ fontSize: 11, margin: 0 }} className="flex flex-wrap items-center gap-1.5">
              <span style={{ color: 'var(--su-action)' }}>
                Cliente: {chat.linked_customer_name}
                {chat.linked_customer_document ? ` (${chat.linked_customer_document})` : ''}
              </span>
              {can('comm.whatsapp.claim') && (
                <button
                  type="button"
                  title="Desfazer o vínculo deste WhatsApp com o cadastro do cliente"
                  disabled={acting}
                  onClick={() => run(() => unlinkCustomer(chat.id), 'Vínculo desfeito.')}
                  style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 11, color: 'var(--su-text-muted)', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  desvincular
                </button>
              )}
            </p>
          )}
        </div>

        <Badge tone={statusToTone(st.variant)}>{st.label}</Badge>

        <div className="flex items-center gap-1">
          {!closed && !isMine && can('comm.whatsapp.claim') && (
            <Button
              variant="secondary" size="sm" icon="user-plus" disabled={acting}
              title="A conversa passa a ser sua — as respostas saem no seu nome"
              onClick={() => run(() => claimChat(chat.id), 'Conversa assumida.')}
            >
              Assumir
            </Button>
          )}
          {!closed && isMine && can('comm.whatsapp.claim') && (
            <Button
              variant="secondary" size="sm" icon="logout" disabled={acting}
              title="Devolve a conversa para quem estiver disponível (mantém equipe e fila)"
              onClick={() => run(() => releaseChat(chat.id), 'Conversa devolvida para o grupo.')}
            >
              Liberar
            </Button>
          )}
          {!closed && can('comm.whatsapp.transfer') && (
            <Button
              variant="secondary" size="sm" icon="arrow-right" disabled={acting}
              title="Passar para outra pessoa, fila ou equipe"
              onClick={onOpenTransfer}
            >
              Transferir
            </Button>
          )}
          {!closed && can('comm.whatsapp.close') && (
            <Button
              variant="secondary" size="sm" icon="check" disabled={acting}
              title="Encerra o atendimento. Se o cliente escrever de novo, a conversa reabre sozinha."
              onClick={() => setConfirmClose(true)}
            >
              Encerrar
            </Button>
          )}
          {closed && can('comm.whatsapp.close') && (
            <Button
              variant="secondary" size="sm" icon="refresh" disabled={acting}
              title="Voltar a atender esta conversa"
              onClick={() => run(() => reopenChat(chat.id), 'Conversa reaberta.')}
            >
              Reabrir
            </Button>
          )}
          <IconButton
            icon="history"
            aria-label="Ver o histórico de atendimento"
            title="Quem assumiu, transferiu e encerrou esta conversa"
            onClick={onOpenTimeline}
          />
        </div>
      </div>

      {/* Área da conversa — fundo do WhatsApp, mantido de propósito (ver o
          comentário no topo do arquivo). */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage: 'radial-gradient(rgba(11,20,26,0.045) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        {messages.filter((m) => m.type !== 'reaction' || !knownMessageIds.has(m.reaction_to_message_id)).map((m) => (
          <Bubble key={m.id} chatId={chat.id} message={m} reactions={reactions.get(m.remote_message_id) || reactions.get(m.external_id) || []} />
        ))}
        {messages.length === 0 && (
          <p className="text-center py-8" style={{ fontSize: 12, color: '#667781' }}>
            Nenhuma mensagem nesta conversa ainda.
          </p>
        )}
      </div>

      <MessageComposer chat={chat} windowInfo={windowInfo} templates={templates} scope={scope} onSent={onSent} />

      <ConfirmDialog
        open={confirmClose}
        danger
        loading={acting}
        title="Encerrar conversa"
        message="Encerrar o atendimento? A conversa sai das listas ativas. Se o cliente mandar mensagem de novo, ela reabre sozinha e volta para o grupo."
        confirmLabel="Encerrar"
        onClose={() => setConfirmClose(false)}
        onConfirm={() => run(() => closeChat(chat.id), 'Conversa encerrada.').then(() => setConfirmClose(false))}
      />
    </div>
  );
}
