import React, { useEffect, useRef, useState } from 'react';
import {
  Check, CheckCheck, Clock, Download, History, Loader2, LockOpen,
  UserCheck, UserMinus, XCircle, ArrowRightLeft, AlertTriangle,
} from 'lucide-react';
import { Badge } from '../../components/ui/Table';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { usePermissions } from '../../hooks/usePermissions';
import { toast } from '../../lib/toast';
import {
  claimChat, releaseChat, closeChat, reopenChat, downloadChatMedia,
} from '../../services/whatsapp';
import { ATTENDANCE_STATUS, formatPhone } from './whatsapp.constants';
import MessageComposer from './MessageComposer';
import AudioPlayer from './AudioPlayer';

// Ticks estilo WhatsApp (sempre sobre balão claro): cinza p/ enviado/entregue,
// azul p/ lido, vermelho p/ falha.
function StatusTicks({ status }) {
  if (status === 'read') return <CheckCheck size={14} style={{ color: '#53bdeb' }} />;
  if (status === 'delivered') return <CheckCheck size={14} style={{ color: '#8696a0' }} />;
  if (status === 'sent') return <Check size={14} style={{ color: '#8696a0' }} />;
  if (status === 'failed') return <AlertTriangle size={13} style={{ color: '#dc2626' }} />;
  return <Clock size={13} style={{ color: '#8696a0' }} />;
}

// Mídia (inbound ou outbound): baixa da Meta sob demanda (proxy base64 do
// backend). Serve tanto pra mídia recebida quanto pra mídia enviada por upload
// do aparelho (persistida com media_id) — o download por media_id é direção-agnóstico.
function ChatMedia({ chatId, message }) {
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

  // Mídia que o próprio atendente enviou: carrega sozinha (a bolha já é dele).
  // Inbound continua sob demanda (evita baixar tudo ao abrir a conversa).
  useEffect(() => {
    if (outgoing && !data && media.media_id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.media_id]);

  if (!data) {
    return (
      <button type="button" onClick={load} disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs underline disabled:opacity-60"
        style={{ color: '#027eb5', minHeight: 32 }}>
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        Carregar {message.type === 'image' ? 'imagem' : message.type === 'audio' ? 'áudio' : message.type === 'video' ? 'vídeo' : 'arquivo'}
      </button>
    );
  }
  const mime = data.mime || media.mime_type || '';
  if (message.type === 'image' || mime.startsWith('image/')) {
    return <img src={data.src} alt="Imagem" className="rounded-lg max-w-full max-h-64" />;
  }
  if (message.type === 'audio' || mime.startsWith('audio/')) {
    // Player custom (portado do Aquapark) — resolve duração de blob/opus da Meta,
    // que o <audio> nativo não consegue. `light` = variante pra balão claro.
    return <AudioPlayer src={data.src} light={true} />;
  }
  if (message.type === 'video' || mime.startsWith('video/')) {
    return <video controls src={data.src} className="rounded-lg max-w-full max-h-64" />;
  }
  return (
    <a href={data.src} download={media.filename || 'arquivo'} className="inline-flex items-center gap-1.5 text-xs underline" style={{ color: '#027eb5' }}>
      <Download size={13} /> {media.filename || 'Baixar arquivo'}
    </a>
  );
}

// Balão estilo WhatsApp oficial: enviado = verde (#d9fdd3) à direita,
// recebido = branco à esquerda, texto escuro, sombra leve. Cores fixas
// (independem do tema do painel) — igual ao Aquapark.
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
          // Com media_id (upload real ou inbound): player/imagem via download por
          // base64. Sem media_id mas com url (outbound legado por link): só o link.
          message.media.media_id
            ? <ChatMedia chatId={chatId} message={message} />
            : (message.media.url && <a className="text-xs underline break-all" href={message.media.url} target="_blank" rel="noreferrer" style={{ color: '#027eb5' }}>{message.media.url}</a>)
        )}
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        <div className="flex items-center gap-1 justify-end text-[10px]" style={{ color: '#667781' }}>
          {message.type === 'template' && <span>(modelo)</span>}
          <span>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          {outgoing && <StatusTicks status={message.status} />}
        </div>
        {message.status === 'failed' && message.error_detail && (
          <p className="text-[10px]" style={{ color: '#dc2626' }}>{message.error_detail}</p>
        )}
      </div>
    </div>
  );
}

// Janela da conversa: header com ações de atendimento + bolhas + composer.
export default function ChatWindow({
  chat, messages, windowInfo, templates, scope, meId,
  onRefresh, onOpenTransfer, onOpenTimeline, onSent,
}) {
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
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--ap-border)' }}>
        {/* Avatar estilo WhatsApp: bolinha verde com a inicial do contato. */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
          {(chat.contact_name || chat.phone || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>
            {chat.contact_name || formatPhone(chat.phone)}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--ap-text-4)' }}>
            {formatPhone(chat.phone)}
            {chat.current_handler_name ? ` — atendido por ${chat.current_handler_name}` : ' — sem atendente'}
          </p>
        </div>
        <Badge variant={st.variant}>{st.label}</Badge>

        <div className="flex items-center gap-1">
          {!closed && !isMine && can('comm.whatsapp.claim') && (
            <button type="button" title="Assumir esta conversa (vira sua)" disabled={acting}
              onClick={() => run(() => claimChat(chat.id), 'Conversa assumida.')}
              className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs" style={{ minHeight: 34 }}>
              <UserCheck size={13} /> Assumir
            </button>
          )}
          {!closed && isMine && can('comm.whatsapp.claim') && (
            <button type="button" title="Devolver a conversa pro pool (mantém equipe/fila)" disabled={acting}
              onClick={() => run(() => releaseChat(chat.id), 'Conversa liberada pro pool.')}
              className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs" style={{ minHeight: 34 }}>
              <UserMinus size={13} /> Liberar
            </button>
          )}
          {!closed && can('comm.whatsapp.transfer') && (
            <button type="button" title="Transferir pra outro atendente, fila ou equipe" disabled={acting}
              onClick={onOpenTransfer}
              className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs" style={{ minHeight: 34 }}>
              <ArrowRightLeft size={13} /> Transferir
            </button>
          )}
          {!closed && can('comm.whatsapp.close') && (
            <button type="button" title="Encerrar o atendimento (a conversa reabre sozinha se o cliente voltar)" disabled={acting}
              onClick={() => setConfirmClose(true)}
              className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs text-red-400" style={{ minHeight: 34 }}>
              <XCircle size={13} /> Encerrar
            </button>
          )}
          {closed && can('comm.whatsapp.close') && (
            <button type="button" title="Reabrir o atendimento" disabled={acting}
              onClick={() => run(() => reopenChat(chat.id), 'Conversa reaberta.')}
              className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs" style={{ minHeight: 34 }}>
              <LockOpen size={13} /> Reabrir
            </button>
          )}
          <button type="button" title="Trilha de atendimento (quem assumiu, transferiu, encerrou)"
            onClick={onOpenTimeline}
            className="btn-secondary !px-2.5 inline-flex items-center gap-1 text-xs" style={{ minHeight: 34 }}>
            <History size={13} />
          </button>
        </div>
      </div>

      {/* Mensagens */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
        style={{
          // Fundo estilo WhatsApp: bege + padrão sutil de pontinhos (igual Aquapark).
          backgroundColor: '#efeae2',
          backgroundImage: 'radial-gradient(rgba(11,20,26,0.045) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      >
        {messages.map((m) => <Bubble key={m.id} chatId={chat.id} message={m} />)}
        {messages.length === 0 && (
          <p className="text-center text-xs py-8" style={{ color: 'var(--ap-text-4)' }}>Sem mensagens ainda.</p>
        )}
      </div>

      {/* Composer */}
      <MessageComposer chat={chat} windowInfo={windowInfo} templates={templates} scope={scope} onSent={onSent} />

      <ConfirmDialog
        open={confirmClose}
        danger
        loading={acting}
        title="Encerrar conversa"
        message="Encerrar o atendimento desta conversa? Ela sai das filas ativas — se o cliente mandar nova mensagem, reabre automaticamente."
        confirmLabel="Encerrar"
        onClose={() => setConfirmClose(false)}
        onConfirm={() => run(() => closeChat(chat.id), 'Conversa encerrada.').then(() => setConfirmClose(false))}
      />
    </div>
  );
}
