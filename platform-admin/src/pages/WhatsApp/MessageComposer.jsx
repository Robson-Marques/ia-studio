// Composer estilo WhatsApp Web — texto + anexo (Galeria/Câmera/Doc) + gravação
// de áudio com pause/resume/prévia + swap send/mic. UI/UX portada do Aquapark;
// a camada de API foi adaptada aos contratos do IA Studio (chat.id + serviços).
//
// Consciência da janela de 24h da Meta (mantida do IA Studio):
//   - within        → barra do Aquapark (anexo/mic/texto livre + upload real);
//   - expired/none  → banner amarelo + envio SÓ por template aprovado.
// Takeover: 409 NEEDS_TAKEOVER_CONFIRMATION → ConfirmDialog "assumir ao responder".
import React, { useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, X, Mic, Square, Pause, RotateCcw, FileText, Music,
  Plus, Camera, Image as ImageIcon, Clock, Link2,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { FormField, TextInput, Select } from '../../components/ui/FormField';
import { toast } from '../../lib/toast';
import { sendChatMessage, uploadChatMedia, sendTyping } from '../../services/whatsapp';
import AudioPlayer from './AudioPlayer';

// Detecta o "kind" da Meta a partir do mime do arquivo.
function kindFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* noop */ }
  }
  return '';
}

// 409 de takeover (NEEDS_TAKEOVER_CONFIRMATION) — igual sinalização do IA Studio.
function isTakeover(err) {
  return err?.code === 'NEEDS_TAKEOVER_CONFIRMATION'
    || (err?.status === 409 && /assumir/i.test(err?.message || ''));
}

function FilePreview({ file, onRemove }) {
  const isImg = file.type.startsWith('image/');
  const isAud = file.type.startsWith('audio/');
  const previewUrl = isImg ? URL.createObjectURL(file) : null;
  const audioUrl   = isAud ? URL.createObjectURL(file) : null;
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 rounded-xl text-xs"
      style={{ background: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)' }}>
      <div className="flex items-center gap-2">
        {isImg && previewUrl
          ? <img src={previewUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />
          : isAud
          ? <Music size={18} className="shrink-0" style={{ color: 'var(--ap-text-3)' }} />
          : <FileText size={18} className="shrink-0" style={{ color: 'var(--ap-text-3)' }} />}
        <span className="flex-1 truncate max-w-[220px]" style={{ color: 'var(--ap-text-1)' }}>{file.name}</span>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-500/10 text-red-500" type="button">
          <X size={14} />
        </button>
      </div>
      {isAud && audioUrl && <AudioPlayer src={audioUrl} light={true} />}
    </div>
  );
}

const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Estados de gravação: idle -> recording -> paused/recording -> preview -> idle
export default function MessageComposer({ chat, windowInfo, templates, scope, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  // Takeover — guarda a função de reenvio quando o backend pede confirmação
  // (409 NEEDS_TAKEOVER). Null = sem pendência.
  const [takeover, setTakeover] = useState(null);

  const galleryRef = useRef(null); // imagem/vídeo
  const cameraRef = useRef(null);  // câmera nativa (mobile)
  const docRef = useRef(null);     // documento
  const [attachMenu, setAttachMenu] = useState(false);
  const taRef = useRef(null);
  function pickFrom(ref) { setAttachMenu(false); ref.current?.click(); }

  // "Digitando…" no WhatsApp do cliente enquanto o atendente escreve. A Meta
  // mostra por ~25s (ou some ao enviar); throttle local pra não floodar a API.
  const lastTypingRef = useRef(0);
  function notifyTyping() {
    if (expired || closed || sending) return;
    const now = Date.now();
    if (now - lastTypingRef.current < 8000) return;
    lastTypingRef.current = now;
    sendTyping(chat.id);
  }

  // Janela de 24h + template (fluxo do IA Studio — mantido).
  const [mediaOpen, setMediaOpen] = useState(false);
  const [media, setMedia] = useState({ kind: 'image', url: '', caption: '' });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const closed = chat.attendance_status === 'CLOSED';
  const windowState = windowInfo?.state || 'none';
  const expired = windowState !== 'within';
  const approved = (templates || []).filter(
    (t) => t.status === 'APPROVED' && t.connection_id === chat.connection_id,
  );

  // Auto-resize do textarea (estilo WhatsApp): cresce até o maxHeight, depois rola.
  const MAX_TA = 120;
  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_TA) + 'px';
  }
  function resetTa() {
    const el = taRef.current;
    if (el) el.style.height = 'auto';
  }

  // Gravação
  const [recState, setRecState] = useState('idle'); // idle | recording | paused | preview
  const [recSecs,  setRecSecs]  = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl,  setAudioUrl]  = useState(null);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);
  const streamRef   = useRef(null);
  const mimeRef     = useRef('');

  // Libera timers/stream/URL ao desmontar (evita mic preso ligado + leak de blob).
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const isRecording = recState !== 'idle';

  async function startRecording() {
    if (expired || sending) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Navegador não suporta gravação de áudio.');
      return;
    }
    const mime = pickAudioMime();
    if (mime === null) {
      toast.error('Navegador não suporta MediaRecorder.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      mimeRef.current = mime;
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        // Blob com o mime real do gravador — NUNCA renomear pra ogg se for webm,
        // isso corrompe o arquivo.
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecState('preview');
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      mr.start(100); // chunks a cada 100ms — necessário pra pause/resume
      recorderRef.current = mr;
      setRecState('recording');
      setRecSecs(0);
      timerRef.current = setInterval(() => {
        setRecSecs((s) => {
          if (s >= 60 * 5) {
            try { mr.stop(); } catch { /* noop */ }
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão do microfone negada. Libere no navegador e tente de novo.'
        : (err.message || 'Erro ao acessar o microfone');
      toast.error(msg);
    }
  }

  function pauseRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecState('paused');
    }
  }

  function resumeRecording() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
      setRecState('recording');
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    // onstop -> setRecState('preview')
  }

  function cancelRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecState('idle');
    setRecSecs(0);
  }

  function reRecord() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecSecs(0);
    startRecording();
  }

  // ─── Envio (adaptado ao IA Studio: chat.id + uploadChatMedia/sendChatMessage) ─

  async function sendRecordedAudio(confirmTakeover = false) {
    if (!audioBlob) return;
    setSending(true);
    try {
      const mime = mimeRef.current || audioBlob.type || 'audio/webm';
      const ext  = mime.includes('ogg') ? 'ogg'
                 : mime.includes('mp4') ? 'm4a'
                 : 'webm';
      const audioFile = new File([audioBlob], `audio-${Date.now()}.${ext}`, { type: audioBlob.type });
      await uploadChatMedia(chat.id, audioFile, 'audio', {
        confirm_takeover: confirmTakeover || undefined,
      });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecState('idle');
      setRecSecs(0);
      await onSent?.();
    } catch (err) {
      if (isTakeover(err)) setTakeover({ retry: () => sendRecordedAudio(true) });
      else toast.error(err.message || 'Erro ao enviar áudio');
    } finally {
      setSending(false);
    }
  }

  async function send(confirmTakeover = false) {
    if (!text.trim()) { toast.error('Escreva uma mensagem.'); return; }
    setSending(true);
    try {
      await sendChatMessage(chat.id, {
        text: text.trim(),
        ...(confirmTakeover ? { confirm_takeover: true } : {}),
      });
      setText('');
      resetTa();
      taRef.current?.focus(); // mantém o foco no input após enviar (estilo WhatsApp)
      await onSent?.();
    } catch (err) {
      if (isTakeover(err)) setTakeover({ retry: () => send(true) });
      else toast.error(err.message || 'Erro ao enviar');
    } finally { setSending(false); }
  }

  async function sendMedia(confirmTakeover = false) {
    if (!file) return;
    setSending(true);
    try {
      await uploadChatMedia(chat.id, file, kindFromMime(file.type), {
        caption: caption || undefined,
        confirm_takeover: confirmTakeover || undefined,
      });
      setFile(null); setCaption('');
      await onSent?.();
    } catch (err) {
      if (isTakeover(err)) setTakeover({ retry: () => sendMedia(true) });
      else toast.error(err.message || 'Erro ao enviar arquivo');
    } finally { setSending(false); }
  }

  // Mídia por URL pública (fluxo "avançado" do IA Studio — mantido).
  async function handleSendMediaUrl(confirmTakeover = false) {
    if (!media.url.trim()) { toast.error('Informe a URL pública da mídia.'); return; }
    setSending(true);
    try {
      await sendChatMessage(chat.id, {
        media: { kind: media.kind, url: media.url.trim(), caption: media.caption || undefined },
        ...(confirmTakeover ? { confirm_takeover: true } : {}),
      });
      setMedia({ kind: 'image', url: '', caption: '' });
      setMediaOpen(false);
      await onSent?.();
    } catch (err) {
      if (isTakeover(err)) setTakeover({ retry: () => handleSendMediaUrl(true) });
      else toast.error(err.message || 'Erro ao enviar mídia');
    } finally { setSending(false); }
  }

  function handleSendTemplate() {
    if (!templateName) { toast.error('Selecione um template aprovado.'); return; }
    const tpl = approved.find((t) => t.name === templateName);
    setSending(true);
    sendChatMessage(chat.id, { template: { name: templateName, language: tpl?.language || 'pt_BR' } })
      .then(() => { setTemplateOpen(false); setTemplateName(''); return onSent?.(); })
      .catch((err) => toast.error(err.message || 'Erro ao enviar template'))
      .finally(() => setSending(false));
  }

  if (closed) {
    return (
      <div className="px-3 py-3 text-center text-xs"
        style={{ borderTop: '1px solid var(--ap-border)', color: 'var(--ap-text-4)' }}>
        Conversa encerrada — reabra para responder.
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t shrink-0 space-y-2"
      style={{
        background: 'var(--ap-surface)', borderColor: 'var(--ap-border)',
        // Recuo da safe-area AQUI no composer: o fundo branco (surface) do próprio
        // composer preenche a faixa do home indicator do iPhone — flush, sem faixa
        // cinza embaixo. py-2 já dá 0.5rem; somamos o env por cima.
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
      }}>

      {/* Fora da janela de 24h: só template aprovado (fluxo do IA Studio) */}
      {expired && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'rgba(234, 179, 8, 0.12)', color: 'var(--ap-text-2)' }}>
          <Clock size={13} className="text-yellow-500 shrink-0" />
          <span className="flex-1">
            {windowState === 'none'
              ? 'Primeiro contato: a Meta só permite iniciar conversa com um template aprovado.'
              : 'Janela de 24h expirada: a Meta só aceita template aprovado até o cliente responder.'}
          </span>
          <button type="button" className="btn-secondary !px-2.5 text-xs" style={{ minHeight: 32 }}
            onClick={() => setTemplateOpen(true)}>
            Usar template
          </button>
        </div>
      )}

      {/* Preview de arquivo (img/doc/áudio) selecionado — só dentro da janela */}
      {file && !isRecording && !expired && (
        <div className="space-y-1.5">
          <FilePreview file={file} onRemove={() => { setFile(null); setCaption(''); }} />
          {!file.type.startsWith('audio/') && (
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Legenda (opcional)"
              className="input text-xs w-full"
              disabled={sending}
            />
          )}
          <button
            type="button"
            onClick={() => sendMedia()}
            disabled={sending}
            className="btn-primary w-full text-sm"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      )}

      {/* Gravando ou pausado */}
      {(recState === 'recording' || recState === 'paused') && (
        <div className="rounded-xl p-3 space-y-2"
          style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              recState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-orange-400'}`} />
            <span className="text-sm font-semibold flex-1" style={{ color: '#dc2626' }}>
              {recState === 'paused' ? `Pausado — ${fmtTime(recSecs)}` : `Gravando... ${fmtTime(recSecs)}`}
            </span>
            <button onClick={cancelRecording} title="Cancelar" type="button"
              className="p-1 rounded hover:bg-red-500/10 text-red-500">
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            {recState === 'recording' ? (
              <button onClick={pauseRecording} type="button"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition"
                style={{ background: 'rgba(249,115,22,0.15)', color: '#c2410c' }}>
                <Pause size={13} /> Pausar
              </button>
            ) : (
              <button onClick={resumeRecording} type="button"
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#15803d' }}>
                <Mic size={13} /> Continuar
              </button>
            )}
            <button onClick={stopRecording} type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition"
              style={{ background: 'rgba(220,38,38,0.15)', color: '#b91c1c' }}>
              <Square size={13} /> Concluir
            </button>
          </div>
        </div>
      )}

      {/* Prévia do áudio gravado — escutar antes de enviar */}
      {recState === 'preview' && audioUrl && (
        <div className="rounded-xl p-3 space-y-2"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold flex-1" style={{ color: '#15803d' }}>
              Prévia do áudio — {fmtTime(recSecs)}
            </span>
            <button onClick={cancelRecording} title="Descartar" type="button"
              className="p-1 rounded hover:bg-red-500/10 text-red-500">
              <X size={15} />
            </button>
          </div>
          <AudioPlayer src={audioUrl} light={true} />
          <div className="flex gap-2">
            <button onClick={reRecord} type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition"
              style={{ background: 'var(--ap-surface-2)', color: 'var(--ap-text-2)' }}>
              <RotateCcw size={13} /> Regravar
            </button>
            <button onClick={() => sendRecordedAudio()} disabled={sending} type="button"
              className="btn-primary flex-1 text-xs">
              {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {sending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}

      {/* Barra padrão — anexo + input texto + mic/send. Fora da janela: fica
          desabilitada (o envio sai pelo modal de template). */}
      {!file && !isRecording && (
        <div className="flex items-end gap-1.5">
          {/* Anexo: botão + abre menu (Galeria/Câmera/Documento), estilo WhatsApp. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAttachMenu((v) => !v)}
              className="p-2 rounded-lg hover:bg-slate-500/10 transition-transform"
              style={{ color: 'var(--ap-text-4)', transform: attachMenu ? 'rotate(45deg)' : 'none' }}
              disabled={expired || sending}
              title={expired ? 'Fora da janela de 24h — use um template' : 'Anexar'}
            >
              <Plus size={20} />
            </button>
            {attachMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAttachMenu(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-20 rounded-xl shadow-lg p-2 flex gap-1 w-max"
                  style={{ background: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
                  <AttachBtn icon={ImageIcon} label="Galeria" onClick={() => pickFrom(galleryRef)} />
                  <AttachBtn icon={Camera}    label="Câmera"  onClick={() => pickFrom(cameraRef)} />
                  <AttachBtn icon={FileText}  label="Doc"     onClick={() => pickFrom(docRef)} />
                </div>
              </>
            )}
          </div>
          <input ref={galleryRef} type="file" className="hidden" accept="image/*,video/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setCaption(''); } e.target.value = ''; }} />
          <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setCaption(''); } e.target.value = ''; }} />
          <input ref={docRef} type="file" className="hidden"
            accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setCaption(''); } e.target.value = ''; }} />
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => { setText(e.target.value); autoGrow(); notifyTyping(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !expired) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder={expired ? 'Fora da janela de 24h — use um template' : 'Mensagem'}
            className="flex-1 input resize-none"
            disabled={expired || sending}
            style={{ minHeight: 38, maxHeight: 120 }}
          />
          {/* Swap estilo WhatsApp: com texto -> Enviar; vazio -> Mic (gravar). */}
          {text.trim() ? (
            <button
              type="button"
              onClick={() => send()}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-50"
              style={{ background: '#25d366', color: '#fff' }}
              disabled={expired || sending}
              title="Enviar mensagem"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 disabled:opacity-50"
              style={{ background: '#25d366', color: '#fff' }}
              disabled={expired || sending}
              title={expired ? 'Fora da janela de 24h — use um template' : 'Gravar áudio'}
            >
              <Mic size={16} />
            </button>
          )}
        </div>
      )}

      {/* Link discreto: enviar mídia por URL pública (avançado) — só na janela */}
      {!expired && !isRecording && !file && (
        <button type="button" className="inline-flex items-center gap-1 text-[11px] underline"
          style={{ color: 'var(--ap-text-4)' }} disabled={sending}
          onClick={() => setMediaOpen(true)}>
          <Link2 size={12} /> Enviar mídia por URL pública
        </button>
      )}

      {/* Mídia por URL (avançado) */}
      <Modal open={mediaOpen} onClose={sending ? undefined : () => setMediaOpen(false)} title="Enviar mídia por URL" size="md"
        footer={
          <>
            <button className="btn-secondary" disabled={sending} onClick={() => setMediaOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={sending} onClick={() => handleSendMediaUrl()}>
              {sending ? 'Enviando…' : 'Enviar mídia'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <FormField label="Tipo" required>
            <Select value={media.kind} onChange={(e) => setMedia((m) => ({ ...m, kind: e.target.value }))}>
              <option value="image">Imagem</option>
              <option value="audio">Áudio</option>
              <option value="video">Vídeo</option>
              <option value="document">Documento</option>
            </Select>
          </FormField>
          <FormField label="URL pública da mídia" required hint="A Meta baixa da URL. Para enviar do aparelho, use o anexo/microfone da barra.">
            <TextInput value={media.url} onChange={(e) => setMedia((m) => ({ ...m, url: e.target.value }))} placeholder="https://…" />
          </FormField>
          <FormField label="Legenda">
            <TextInput value={media.caption} onChange={(e) => setMedia((m) => ({ ...m, caption: e.target.value }))} />
          </FormField>
        </div>
      </Modal>

      {/* Template (fora da janela) */}
      <Modal open={templateOpen} onClose={sending ? undefined : () => setTemplateOpen(false)} title="Enviar template aprovado" size="md"
        footer={
          <>
            <button className="btn-secondary" disabled={sending} onClick={() => setTemplateOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={sending} onClick={handleSendTemplate}>
              {sending ? 'Enviando…' : 'Enviar template'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-3)' }}>
            Fora da janela de 24h a Meta exige um template HSM aprovado. O texto enviado é o do template.
          </p>
          <FormField label="Template" required>
            <Select value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
              <option value="">Selecione…</option>
              {approved.map((t) => (
                <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
              ))}
            </Select>
          </FormField>
          {approved.length === 0 && (
            <p className="text-xs text-yellow-500">
              Nenhum template aprovado nesta conexão — crie/sincronize em WhatsApp → Templates.
            </p>
          )}
        </div>
      </Modal>

      {/* Takeover: assumir ao responder */}
      <ConfirmDialog
        open={!!takeover}
        danger
        loading={sending}
        title="Assumir a conversa?"
        message="Esta conversa está com outro atendente. Ao confirmar, ela passa a ser sua e a mensagem é enviada."
        confirmLabel="Assumir e enviar"
        onClose={() => setTakeover(null)}
        onConfirm={() => { const t = takeover; setTakeover(null); t?.retry?.(); }}
      />
    </div>
  );
}

// Botão do menu de anexo (Galeria/Câmera/Documento).
function AttachBtn({ icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-slate-500/10 w-16">
      <span className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: 'var(--ap-surface-2)', color: 'var(--ap-text-2)' }}>
        <Icon size={18} />
      </span>
      <span className="text-[10px]" style={{ color: 'var(--ap-text-4)' }}>{label}</span>
    </button>
  );
}
