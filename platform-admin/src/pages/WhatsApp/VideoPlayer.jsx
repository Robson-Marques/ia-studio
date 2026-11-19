import React, { useEffect, useRef, useState } from 'react';
import { DSIcon } from '@studio-ux-ds/react';

/**
 * Reprodução de vídeo dentro do balão com miniatura do primeiro quadro.
 *
 * A mídia vem do proxy autenticado e já é um blob local. Não repassamos URLs
 * públicas nem dados da sessão WAHA ao navegador. A miniatura é produzida
 * no próprio browser com canvas, sem salvar outro arquivo no servidor.
 */
export default function VideoPlayer({ src, mime, filename = 'video.mp4' }) {
  const videoRef = useRef(null);
  const [poster, setPoster] = useState('');
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPoster('');
    setStarted(false);
    setError(false);
  }, [src]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || poster) return;
    try {
      const canvas = document.createElement('canvas');
      // Limitar resolução para não gastar memória com miniaturas 4K.
      const ratio = Math.min(1, 480 / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
      canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      setPoster(canvas.toDataURL('image/jpeg', 0.75));
    } catch {
      // Alguns formatos/decodificadores não permitem canvas. O player nativo
      // ainda pode ser usado; mostramos o fundo com botão de reprodução.
    }
  }

  function prepareThumbnail() {
    const video = videoRef.current;
    if (!video || started) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const firstFrame = duration > 0 ? Math.min(0.15, duration / 2) : 0;
    if (firstFrame > 0) {
      try {
        video.currentTime = firstFrame;
        return;
      } catch { /* Capturar o frame já disponível. */ }
    }
    captureFrame();
  }

  async function play() {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    setError(false);
    try {
      // A reprodução só inicia por clique explícito do usuário.
      await video.play();
    } catch {
      setError(true);
    }
  }

  return (
    <div className="relative max-w-full overflow-hidden rounded-lg"
      style={{ width: 288, maxWidth: '100%', backgroundColor: '#111827' }}>
      <video
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="auto"
        controls={started}
        onLoadedMetadata={prepareThumbnail}
        onLoadedData={captureFrame}
        onSeeked={captureFrame}
        onError={() => setError(true)}
        className="block w-full"
        style={{ width: '100%', maxHeight: 260, minHeight: 160, objectFit: 'contain' }}
        aria-label="Vídeo da conversa"
      />
      {!started && !error && (
        <button
          type="button"
          onClick={play}
          aria-label="Reproduzir vídeo"
          title="Reproduzir vídeo"
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: poster ? 'rgba(0,0,0,.10)' : 'rgba(0,0,0,.36)', border: 0, cursor: 'pointer' }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(17,24,39,.82)', color: '#fff' }}>
            <DSIcon name="play" size="lg" />
          </span>
        </button>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center"
          style={{ backgroundColor: '#111827', color: '#fff', fontSize: 12 }}>
          <span>Não foi possível reproduzir este formato no navegador.</span>
          <a href={src} download={filename} style={{ color: '#fff', textDecoration: 'underline' }}>
            Baixar vídeo
          </a>
        </div>
      )}
    </div>
  );
}
