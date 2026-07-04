import React, { useState } from 'react';
import { Clock, Loader2, Paperclip, Send, X } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { FormField, TextInput, Select } from '../../components/ui/FormField';
import { toast } from '../../lib/toast';
import { sendChatMessage } from '../../services/whatsapp';

// Composer com consciência da janela de 24h da Meta:
//   - within  → texto livre e mídia liberados;
//   - expired/none → banner amarelo + envio só por template aprovado.
// Takeover: 409 NEEDS_TAKEOVER_CONFIRMATION → ConfirmDialog "assumir ao responder".
export default function MessageComposer({ chat, windowInfo, templates, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [media, setMedia] = useState({ kind: 'image', url: '', caption: '' });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [pendingBody, setPendingBody] = useState(null); // reenvio pós-takeover

  const closed = chat.attendance_status === 'CLOSED';
  const windowState = windowInfo?.state || 'none';
  const expired = windowState !== 'within';
  const approved = (templates || []).filter((t) => t.status === 'APPROVED' && t.connection_id === chat.connection_id);

  async function doSend(body) {
    setSending(true);
    try {
      await sendChatMessage(chat.id, body);
      setText('');
      setMedia({ kind: 'image', url: '', caption: '' });
      setMediaOpen(false);
      setTemplateOpen(false);
      setPendingBody(null);
      await onSent();
    } catch (err) {
      if (err.code === 'NEEDS_TAKEOVER_CONFIRMATION' || (err.status === 409 && /assumir/i.test(err.message))) {
        setPendingBody(body); // abre o ConfirmDialog de takeover
      } else {
        toast.error(err.message);
      }
    } finally {
      setSending(false);
    }
  }

  function handleSendText() {
    const body = text.trim();
    if (!body) { toast.error('Escreva a mensagem antes de enviar.'); return; }
    doSend({ text: body });
  }

  function handleSendMedia() {
    if (!media.url.trim()) { toast.error('Informe a URL pública da mídia.'); return; }
    doSend({ media: { kind: media.kind, url: media.url.trim(), caption: media.caption || undefined } });
  }

  function handleSendTemplate() {
    if (!templateName) { toast.error('Selecione um template aprovado.'); return; }
    const tpl = approved.find((t) => t.name === templateName);
    doSend({ template: { name: templateName, language: tpl?.language || 'pt_BR' } });
  }

  if (closed) {
    return (
      <div className="px-3 py-3 text-center text-xs" style={{ borderTop: '1px solid var(--ap-border)', color: 'var(--ap-text-4)' }}>
        Conversa encerrada — reabra para responder.
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--ap-border)' }}>
      {expired && (
        <div className="px-3 py-2 flex items-center gap-2 text-xs"
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

      <div className="px-3 py-2 flex items-end gap-2">
        <button
          type="button"
          title="Anexar mídia por URL pública (imagem, áudio, vídeo, documento)"
          className="btn-secondary !px-2.5 disabled:opacity-50"
          style={{ minHeight: 40 }}
          disabled={expired || sending}
          onClick={() => setMediaOpen(true)}
        >
          <Paperclip size={15} />
        </button>
        <textarea
          className="input flex-1 resize-none text-sm"
          rows={2}
          placeholder={expired ? 'Fora da janela de 24h — use um template' : 'Digite a mensagem…'}
          value={text}
          disabled={expired || sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
          }}
        />
        <button
          type="button"
          title="Enviar (Enter)"
          className="btn-primary !px-3 inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{ minHeight: 40 }}
          disabled={sending || (expired && !templateName)}
          onClick={expired ? () => setTemplateOpen(true) : handleSendText}
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      {/* Mídia por URL */}
      <Modal open={mediaOpen} onClose={sending ? undefined : () => setMediaOpen(false)} title="Enviar mídia" size="md"
        footer={
          <>
            <button className="btn-secondary" disabled={sending} onClick={() => setMediaOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={sending} onClick={handleSendMedia}>
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
          <FormField label="URL pública da mídia" required hint="Nesta fase o envio de mídia é por link público (a Meta baixa da URL).">
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
        open={!!pendingBody}
        danger
        loading={sending}
        title="Assumir a conversa?"
        message="Esta conversa está com outro atendente. Ao confirmar, ela passa a ser sua e a mensagem é enviada."
        confirmLabel="Assumir e enviar"
        onClose={() => setPendingBody(null)}
        onConfirm={() => doSend({ ...pendingBody, confirm_takeover: true })}
      />
    </div>
  );
}
