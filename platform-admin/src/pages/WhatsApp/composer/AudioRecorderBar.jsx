import React from 'react';
import { Button, IconButton, DSIcon } from '@studio-ux-ds/react';
import AudioPlayer from '../AudioPlayer';
import { fmtTime } from './useAudioRecorder';

// A barra de gravação de áudio do composer (v0.10.9).
//
// Só desenho e gesto: quem grava é o `useAudioRecorder`. Os fundos e textos usavam
// `rgba(220,38,38,.08)`, `#dc2626`, `#15803d` cravados; agora vêm dos papéis do
// tema (perigo enquanto grava, sucesso na prévia) — e funcionam no escuro.

export default function AudioRecorderBar({ rec, sending, onSend }) {
  if (rec.state === 'idle') return null;

  const gravando = rec.state === 'recording' || rec.state === 'paused';

  if (gravando) {
    return (
      <div
        className="space-y-2"
        style={{
          borderRadius: 12, padding: 12,
          background: 'var(--su-danger-bg)',
          border: '1px solid color-mix(in srgb, var(--su-danger) 25%, transparent)',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className={rec.state === 'recording' ? 'animate-pulse' : ''}
            style={{
              width: 10, height: 10, borderRadius: '50%', flex: 'none',
              background: rec.state === 'recording' ? 'var(--su-danger)' : 'var(--su-warning-fg)',
            }}
          />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--su-danger-fg)' }}>
            {rec.state === 'paused' ? `Pausado — ${fmtTime(rec.secs)}` : `Gravando… ${fmtTime(rec.secs)}`}
          </span>
          <IconButton icon="close" aria-label="Descartar a gravação" title="Descartar" onClick={rec.cancel} />
        </div>
        <div className="flex gap-2">
          {rec.state === 'recording' ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={rec.pause}>
              <DSIcon name="pause" size="sm" /> Pausar
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" onClick={rec.resume}>
              <DSIcon name="mic" size="sm" /> Continuar
            </Button>
          )}
          <Button variant="primary" size="sm" className="flex-1" onClick={rec.stop}>
            <DSIcon name="square" size="sm" /> Concluir
          </Button>
        </div>
      </div>
    );
  }

  // Prévia: escutar antes de enviar.
  return (
    <div
      className="space-y-2"
      style={{
        borderRadius: 12, padding: 12,
        background: 'var(--su-success-bg)',
        border: '1px solid color-mix(in srgb, var(--su-success-fg) 25%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--su-success-fg)' }}>
          Ouça antes de enviar — {fmtTime(rec.secs)}
        </span>
        <IconButton icon="close" aria-label="Descartar o áudio" title="Descartar" onClick={rec.cancel} />
      </div>
      {rec.url && <AudioPlayer src={rec.url} light />}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={rec.redo}>
          <DSIcon name="rotate" size="sm" /> Gravar de novo
        </Button>
        <Button variant="primary" size="sm" icon="send" className="flex-1" loading={sending} onClick={onSend}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
