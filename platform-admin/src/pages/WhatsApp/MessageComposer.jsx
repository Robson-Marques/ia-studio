import React, { useRef, useState } from 'react';
import { Modal, ConfirmDialog, Field, Input, Select, Button, useToast, DSIcon } from '@studio-ux-ds/react';
import { sendChatMessage, uploadChatMedia, sendTyping } from '../../services/whatsapp';
import { useAudioRecorder } from './composer/useAudioRecorder';
import AudioRecorderBar from './composer/AudioRecorderBar';
import { AttachButton, AttachDraft, kindFromMime } from './composer/AttachPicker';

// WhatsApp/MessageComposer — a barra de escrever. Migrada pro DS e **partida por
// responsabilidade** na v0.10.9 (eram 640 linhas com sete grupos de estado
// independentes no mesmo arquivo):
//
//   · `composer/useAudioRecorder.js` — gravar, pausar, escutar, descartar
//   · `composer/AudioRecorderBar.jsx` — o desenho da gravação
//   · `composer/AttachPicker.jsx` — botão “+”, menu, inputs e prévia do arquivo
//   · aqui — texto, envio, janela de 24h, template e takeover
//
// O que **não** mudou de comportamento: a consciência da janela de 24h da Meta
// (dentro = texto livre; fora = só template aprovado), o "digitando…" com
// throttle, e o takeover quando a conversa é de outra pessoa.
//
// O botão de enviar mantém o verde do WhatsApp (#25d366): é o gesto mais repetido
// do dia do atendente, e a memória muscular vale mais que a coerência de accent
// aqui — mesma exceção declarada dos balões, em ChatWindow.

// 409 NEEDS_TAKEOVER_CONFIRMATION — a conversa é de outra pessoa.
function isTakeover(err) {
  return err?.code === 'NEEDS_TAKEOVER_CONFIRMATION'
    || (err?.status === 409 && /assumir/i.test(err?.message || ''));
}

const MAX_TA = 120;

export default function MessageComposer({ chat, windowInfo, templates, scope, onSent }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState('');
  const [takeover, setTakeover] = useState(null);

  const [mediaOpen, setMediaOpen] = useState(false);
  const [media, setMedia] = useState({ kind: 'image', url: '', caption: '' });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const taRef = useRef(null);
  const lastTypingRef = useRef(0);

  const closed = chat.attendance_status === 'CLOSED';
  const windowState = windowInfo?.state || 'none';
  const expired = windowState !== 'within';
  const approved = (templates || []).filter(
    (t) => t.status === 'APPROVED' && t.connection_id === chat.connection_id,
  );

  const rec = useAudioRecorder({ onError: (m) => toast.error(m) });

  function autoGrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TA)}px`;
  }

  function resetTa() {
    const el = taRef.current;
    if (el) el.style.height = 'auto';
  }

  // "Digitando…" no WhatsApp do cliente. A Meta mostra por ~25s; o throttle local
  // evita uma chamada por tecla.
  function notifyTyping() {
    if (expired || closed || sending) return;
    const now = Date.now();
    if (now - lastTypingRef.current < 8000) return;
    lastTypingRef.current = now;
    sendTyping(chat.id);
  }

  async function enviar(fn, onOk) {
    setSending(true);
    try {
      const result = await fn(false);
      onOk?.();
      await onSent?.();
      if (result?.job_id) toast.success('Mensagem aceita pela Central. Aguardando confirmação do envio.');
    } catch (err) {
      if (isTakeover(err)) setTakeover({ retry: async () => {
        setSending(true);
        try {
          const result = await fn(true);
          onOk?.();
          await onSent?.();
          if (result?.job_id) toast.success('Mensagem aceita pela Central. Aguardando confirmação do envio.');
        } catch (e2) {
          toast.error(e2.message || 'Não deu para enviar.');
        } finally {
          setSending(false);
        }
      } });
      else toast.error(err.message || 'Não deu para enviar.');
    } finally {
      setSending(false);
    }
  }

  function sendText() {
    if (!text.trim()) { toast.error('Escreva a mensagem.'); return; }
    enviar(
      (confirmTakeover) => sendChatMessage(chat.id, {
        text: text.trim(),
        ...(confirmTakeover ? { confirm_takeover: true } : {}),
      }),
      () => {
        setText('');
        resetTa();
        taRef.current?.focus(); // mantém o foco para a próxima mensagem
      },
    );
  }

  function sendFile() {
    if (!file) return;
    enviar(
      (confirmTakeover) => uploadChatMedia(chat.id, file, kindFromMime(file.type), {
        caption: caption || undefined,
        confirm_takeover: confirmTakeover || undefined,
      }),
      () => { setFile(null); setCaption(''); },
    );
  }

  function sendAudio() {
    const audioFile = rec.toFile();
    if (!audioFile) return;
    enviar(
      (confirmTakeover) => uploadChatMedia(chat.id, audioFile, 'audio', {
        voice: audioFile.type.toLowerCase().includes('ogg') && audioFile.type.toLowerCase().includes('opus'),
        confirm_takeover: confirmTakeover || undefined,
      }),
      () => rec.cancel(),
    );
  }

  function sendMediaUrl() {
    if (!media.url.trim()) { toast.error('Informe o endereço público da mídia.'); return; }
    enviar(
      (confirmTakeover) => sendChatMessage(chat.id, {
        media: { kind: media.kind, url: media.url.trim(), caption: media.caption || undefined },
        ...(confirmTakeover ? { confirm_takeover: true } : {}),
      }),
      () => { setMedia({ kind: 'image', url: '', caption: '' }); setMediaOpen(false); },
    );
  }

  function sendTemplate() {
    if (!templateName) { toast.error('Escolha um template aprovado.'); return; }
    const tpl = approved.find((t) => t.name === templateName);
    enviar(
      () => sendChatMessage(chat.id, {
        template: { name: templateName, language: tpl?.language || 'pt_BR' },
      }),
      () => { setTemplateOpen(false); setTemplateName(''); },
    );
  }

  if (closed) {
    return (
      <div
        className="text-center"
        style={{
          padding: 'var(--su-space-3)', fontSize: 12,
          borderTop: '1px solid var(--su-border-default)', color: 'var(--su-text-muted)',
        }}
      >
        Conversa encerrada — reabra para responder.
      </div>
    );
  }

  const dicaFora = 'Passou de 24h sem resposta do cliente — só um template aprovado pode ser enviado agora';

  return (
    <div
      className="shrink-0 space-y-2"
      style={{
        padding: 'var(--su-space-2) var(--su-space-3)',
        borderTop: '1px solid var(--su-border-default)',
        background: 'var(--su-surface-overlay)',
        // A safe-area entra AQUI: o fundo do composer preenche a faixa do
        // indicador do iPhone, sem sobrar barra cinza embaixo.
        paddingBottom: 'calc(var(--su-space-2) + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {expired && (
        <div
          className="flex items-center gap-2"
          style={{
            fontSize: 12, borderRadius: 8, padding: '8px 12px',
            background: 'var(--su-warning-bg)', color: 'var(--su-warning-fg)',
          }}
        >
          <DSIcon name="clock" size="sm" className="shrink-0" />
          <span style={{ flex: 1 }}>
            {windowState === 'none'
              ? 'Primeiro contato: a Meta só deixa iniciar conversa com um template aprovado.'
              : 'Passaram-se 24h desde a última mensagem do cliente: até ele responder, só template aprovado.'}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setTemplateOpen(true)}>
            Usar template
          </Button>
        </div>
      )}

      {!rec.isBusy && !expired && (
        <AttachDraft
          file={file}
          caption={caption}
          onCaption={setCaption}
          onRemove={() => { setFile(null); setCaption(''); }}
          onSend={sendFile}
          sending={sending}
        />
      )}

      <AudioRecorderBar rec={rec} sending={sending} onSend={sendAudio} />

      {!file && !rec.isBusy && (
        <div className="flex items-end gap-1.5">
          <AttachButton
            disabled={expired || sending}
            title={expired ? dicaFora : 'Anexar imagem, foto ou arquivo'}
            onPick={(f) => { setFile(f); setCaption(''); }}
          />

          <textarea
            ref={taRef}
            className="su-textarea"
            value={text}
            onChange={(e) => { setText(e.target.value); autoGrow(); notifyTyping(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !expired) { e.preventDefault(); sendText(); }
            }}
            rows={1}
            placeholder={expired ? dicaFora : 'Mensagem'}
            disabled={expired || sending}
            style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: MAX_TA }}
          />

          {/* Com texto → enviar; vazio → grava um áudio. O verde é do WhatsApp,
              de propósito (ver o comentário no topo). */}
          <button
            type="button"
            onClick={text.trim() ? sendText : rec.start}
            disabled={expired || sending}
            title={expired ? dicaFora : (text.trim() ? 'Enviar' : 'Gravar um áudio')}
            aria-label={text.trim() ? 'Enviar mensagem' : 'Gravar um áudio'}
            className="flex items-center justify-center shrink-0"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
              background: '#25d366', color: '#fff',
              opacity: (expired || sending) ? 0.5 : 1,
            }}
          >
            {text.trim() ? <DSSend sending={sending} /> : <DSIcon name="mic" size="sm" />}
          </button>
        </div>
      )}

      {!expired && !rec.isBusy && !file && (
        <Button variant="ghost" size="sm" icon="external-link" disabled={sending} onClick={() => setMediaOpen(true)}>
          Enviar mídia por endereço público
        </Button>
      )}

      {/* Campos curtos → Modal é o container certo. */}
      <Modal
        open={mediaOpen}
        onClose={sending ? undefined : () => setMediaOpen(false)}
        title="Enviar mídia por endereço público"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={() => setMediaOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={sending} onClick={sendMediaUrl}>Enviar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Tipo" required>
            <Select value={media.kind} onChange={(e) => setMedia((m) => ({ ...m, kind: e.target.value }))}>
              <option value="image">Imagem</option>
              <option value="audio">Áudio</option>
              <option value="video">Vídeo</option>
              <option value="document">Arquivo</option>
            </Select>
          </Field>
          <Field
            label="Endereço da mídia"
            required
            hint="A Meta busca o arquivo nesse endereço. Para mandar do próprio aparelho, use o + da barra."
          >
            <Input value={media.url} onChange={(e) => setMedia((m) => ({ ...m, url: e.target.value }))} placeholder="https://…" />
          </Field>
          <Field label="Legenda">
            <Input value={media.caption} onChange={(e) => setMedia((m) => ({ ...m, caption: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={templateOpen}
        onClose={sending ? undefined : () => setTemplateOpen(false)}
        title="Enviar um template aprovado"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={() => setTemplateOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={sending} disabled={!approved.length} onClick={sendTemplate}>
              Enviar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
            Depois de 24h sem resposta, a Meta só aceita um texto já aprovado por ela. O que o cliente recebe é o texto do template.
          </p>
          <Field label="Template" required>
            <Select value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
              <option value="">Escolha…</option>
              {approved.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.language})</option>)}
            </Select>
          </Field>
          {!approved.length && (
            <p style={{ fontSize: 12, margin: 0, color: 'var(--su-warning-fg)' }}>
              Este número não tem template aprovado. Crie um em WhatsApp → Templates e espere a análise da Meta.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!takeover}
        danger
        loading={sending}
        title="Assumir a conversa?"
        message="Esta conversa está com outra pessoa. Se você confirmar, ela passa a ser sua e a mensagem é enviada."
        confirmLabel="Assumir e enviar"
        onClose={() => setTakeover(null)}
        onConfirm={() => { const t = takeover; setTakeover(null); t?.retry?.(); }}
      />
    </div>
  );
}

// Ícone de enviar dentro do botão verde: o Spinner do DS herda `currentColor`, que
// aqui é branco — por isso não precisa de cor própria.
function DSSend({ sending }) {
  if (sending) return <span className="su-spinner" aria-hidden="true" />;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 4L3 11l7 3 3 7 7-17z" /><path d="M20 4l-10 10" />
    </svg>
  );
}
