import React, { useRef, useState } from 'react';
import { Button, IconButton, Input, DSIcon } from '@studio-ux-ds/react';
import AudioPlayer from '../AudioPlayer';

// Anexo do composer (v0.10.9): o botão “+”, o menu com Galeria/Câmera/Documento,
// os três inputs de arquivo e a prévia do que foi escolhido.
//
// Extraído do MessageComposer, onde dividia espaço com texto, áudio, template e
// envio. Aqui responde uma pergunta: "como o atendente escolhe e confere um
// arquivo antes de mandar?".

/** Tipo normalizado do canal, a partir do MIME do arquivo. */
export function kindFromMime(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function FilePreview({ file, onRemove }) {
  const isImg = file.type.startsWith('image/');
  const isAud = file.type.startsWith('audio/');
  // URL.createObjectURL a cada render é o comportamento herdado; o arquivo é
  // trocado/removido logo, e o navegador libera ao descarregar o documento.
  const previewUrl = isImg ? URL.createObjectURL(file) : null;
  const audioUrl = isAud ? URL.createObjectURL(file) : null;

  return (
    <div
      className="flex flex-col gap-1.5"
      style={{
        padding: '8px 12px', borderRadius: 12, fontSize: 12,
        background: 'var(--su-surface-raised)',
        border: '1px solid var(--su-border-default)',
        color: 'var(--su-text-secondary)',
      }}
    >
      <div className="flex items-center gap-2">
        {isImg && previewUrl
          ? <img src={previewUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
          : isAud
            ? <DSIcon name="music" size="md" className="shrink-0" style={{ color: 'var(--su-text-muted)' }} />
            : <DSIcon name="file-text" size="md" className="shrink-0" style={{ color: 'var(--su-text-muted)' }} />}
        <span className="flex-1 truncate" style={{ maxWidth: 220, color: 'var(--su-text-primary)' }}>{file.name}</span>
        <IconButton icon="close" aria-label="Tirar este arquivo" title="Tirar" onClick={onRemove} />
      </div>
      {isAud && audioUrl && <AudioPlayer src={audioUrl} light />}
    </div>
  );
}

/** Só o botão “+” e o menu — usado na barra do composer. */
export function AttachButton({ disabled, title, onPick }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const docRef = useRef(null);
  const [open, setOpen] = useState(false);

  function pickFrom(ref) { setOpen(false); ref.current?.click(); }
  function handleFile(e) {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = '';
  }

  // `icon` é o NOME do glifo no catálogo do DS, não um componente importado.
  // Guardar componente aqui era o que obrigava este arquivo a manter uma segunda
  // biblioteca de ícones viva (DS v1.2.41 passou a cobrir mídia/gravação).
  const OPCOES = [
    { icon: 'image', label: 'Galeria', ref: galleryRef },
    { icon: 'camera', label: 'Câmera', ref: cameraRef },
    { icon: 'file-text', label: 'Arquivo', ref: docRef },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <IconButton
        icon="plus"
        aria-label="Anexar"
        aria-expanded={open}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      />

      {open && (
        <>
          {/* Camada para fechar clicando fora — sem ela o menu só fecha no próprio
              botão, e em toque isso trava o usuário. */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div
            className="flex gap-1"
            style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, zIndex: 20,
              padding: 8, borderRadius: 12, width: 'max-content',
              background: 'var(--su-surface-overlay)',
              border: '1px solid var(--su-border-default)',
              boxShadow: 'var(--su-elevation-overlay)',
            }}
          >
            {OPCOES.map(({ icon, label, ref }) => (
              <button
                key={label}
                type="button"
                onClick={() => pickFrom(ref)}
                className="flex flex-col items-center gap-1"
                style={{ width: 64, padding: '8px 12px', borderRadius: 8, border: 0, background: 'none', font: 'inherit', cursor: 'pointer' }}
              >
                <span
                  className="flex items-center justify-center"
                  style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--su-action-tint)', color: 'var(--su-action)' }}
                >
                  <DSIcon name={icon} size="md" />
                </span>
                <span style={{ fontSize: 10, color: 'var(--su-text-muted)' }}>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <input ref={galleryRef} type="file" className="hidden" accept="image/*,video/*" onChange={handleFile} />
      <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFile} />
      <input
        ref={docRef}
        type="file"
        className="hidden"
        accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        onChange={handleFile}
      />
    </div>
  );
}

/** A prévia + legenda + botão de enviar, quando há arquivo escolhido. */
export function AttachDraft({ file, caption, onCaption, onRemove, onSend, sending }) {
  if (!file) return null;
  return (
    <div className="space-y-1.5">
      <FilePreview file={file} onRemove={onRemove} />
      {!file.type.startsWith('audio/') && (
        <Input
          value={caption}
          onChange={(e) => onCaption(e.target.value)}
          placeholder="Escreva uma legenda (opcional)"
          aria-label="Legenda do arquivo"
          disabled={sending}
        />
      )}
      <Button variant="primary" icon="send" className="w-full" loading={sending} onClick={onSend}>
        Enviar arquivo
      </Button>
    </div>
  );
}
