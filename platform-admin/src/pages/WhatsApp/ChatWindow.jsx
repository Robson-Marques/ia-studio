import React, { useEffect, useRef, useState } from 'react';
import {
  Check, CheckCheck, Clock, Download, Loader2, AlertTriangle,
} from 'lucide-react';
import {
  Badge, Button, IconButton, Avatar, ConfirmDialog, useToast,
} from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import {
  claimChat, releaseChat, closeChat, reopenChat, downloadChatMedia, unlinkCustomer,
} from '../../services/whatsapp';
import { ATTENDANCE_STATUS, formatPhone } from './whatsapp.constants';
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
  if (status === 'read') return <CheckCheck size={14} style={{ color: '#53bdeb' }} />;
  if (status === 'delivered') return <CheckCheck size={14} style={{ color: '#8696a0' }} />;
  if (status === 'sent') return <Check size={14} style={{ color: '#8696a0' }} />;
  if (status === 'failed') return <AlertTriangle size={13} style={{ color: '#dc2626' }} />;
  return <Clock size={13} style={{ color: '#8696a0' }} />;
}

// Mídia (recebida ou enviada): baixa da Meta sob demanda via proxy do backend.
function ChatMedia({ chatId, message }) {
  const toast = useToast();
  const media = message.media || {};
  const outgoing = message.direction === 'OUTGOING';
  const [data, setData] = useState(media.url ? { src: media.url, mime: media.mime_type } : null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!media.media_id) return;
    setLoading(true);
    try {
      const r = await downloadChatMedia(chatId, media.media_id);
      setData({ src: `data:${r.mime};base64,${r.base64}`, mime: r.mime });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // O que o próprio atendente enviou carrega sozinho; o que chegou fica sob
  // demanda, para não baixar tudo ao abrir a conversa.
  useEffect(() => {
    if (outgoing && !data && media.media_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.media_id]);

  const NOME_TIPO = { image: 'imagem', audio: 'áudio', video: 'vídeo' };

  if (!data) {
    return (
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="inline-flex items-center gap-1.5"
        style={{ fontSize: 12, color: '#027eb5', minHeight: 32, background: 'none', border: 0, padding: 0, font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Carregar {NOME_TIPO[message.type] || 'arquivo'}
      </button>
    );
  }

  const mime = data.mime || media.mime_type || '';
  if (message.type === 'image' || mime.startsWith('image/')) {
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
  return (
    <a
      href={data.src}
      download={media.filename || 'arquivo'}
      className="inline-flex items-center gap-1.5"
      style={{ fontSize: 12, color: '#027eb5', textDecoration: 'underline' }}
    >
      <Download size={13} /> {media.filename || 'Baixar arquivo'}
    </a>
  );
}

function Bubble({ chatId, message }) {
  const outgoing = message.direction === 'OUTGOING';
  return (
    <div className={outgoing ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className="max-w-[80%] md:max-w-[65%] rounded-lg px-2.5 py-1.5 text-sm space-y-1"
        style={{
          backgroundColor: outgoing ? '#d9fdd3' : '#ffffff',
          color: '#111b21',
          boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
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
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        <div className="flex items-center gap-1 justify-end" style={{ fontSize: 10, color: '#667781' }}>
          {message.type === 'template' && <span>(modelo)</span>}
          <span>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
        <Avatar initials={(nome || '?').slice(0, 1).toUpperCase()} size="sm" alt="" />

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
        {messages.map((m) => <Bubble key={m.id} chatId={chat.id} message={m} />)}
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
