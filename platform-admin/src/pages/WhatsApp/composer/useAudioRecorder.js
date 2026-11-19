import { useEffect, useRef, useState } from 'react';

// Gravação de áudio do composer — extraída do MessageComposer na v0.10.9.
//
// Eram ~120 linhas com 5 refs e 4 estados no meio de um arquivo que também cuidava
// de texto, anexo, template e envio. Aqui responde UMA pergunta: "como grava,
// pausa, escuta e descarta um áudio?". O componente que usa só recebe o estado e
// as funções — e o cleanup (microfone e blob) vive junto de quem os criou, que é o
// motivo de ser um hook e não um componente.
//
// Estados: idle → recording ⇄ paused → preview → idle.

export function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* noop */ }
  }
  return null;
}

export const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const MAX_SECS = 60 * 5;

/**
 * @param {(msg: string) => void} onError  como avisar o usuário (toast do produto)
 */
export function useAudioRecorder({ onError } = {}) {
  const [state, setState] = useState('idle'); // idle | recording | paused | preview
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const mimeRef = useRef('');

  // Libera timer, microfone e URL do blob ao desmontar — sem isto o microfone
  // fica ligado depois de sair da tela, e o blob vaza memória.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* noop */ }
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Este navegador não consegue gravar áudio.');
      return;
    }
    const mime = pickAudioMime();
    if (mime === null) {
      onError?.('Este navegador não grava em formato aceito pelo WhatsApp. Use outro navegador ou anexe um áudio compatível.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      mimeRef.current = mime;

      const mr = new MediaRecorder(stream, { mimeType: mime });
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        // Preserva o MIME real; renomear WebM para OGG não converte o arquivo.
        const b = new Blob(chunksRef.current, { type: mime });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState('preview');
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };

      mr.start(100); // pedaços de 100ms — necessário para pausar e retomar
      recorderRef.current = mr;
      setState('recording');
      setSecs(0);
      timerRef.current = setInterval(() => {
        setSecs((s) => {
          if (s >= MAX_SECS) {
            try { mr.stop(); } catch { /* noop */ }
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      onError?.(err?.name === 'NotAllowedError'
        ? 'O navegador bloqueou o microfone. Libere o acesso e tente de novo.'
        : (err.message || 'Não foi possível usar o microfone.'));
    }
  }

  function pause() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setState('paused');
    }
  }

  function resume() {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
      setState('recording');
    }
  }

  function stop() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    // o onstop leva para 'preview'
  }

  function cancel() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.stop(); } catch { /* noop */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    if (url) URL.revokeObjectURL(url);
    setBlob(null);
    setUrl(null);
    setState('idle');
    setSecs(0);
  }

  function redo() {
    if (url) URL.revokeObjectURL(url);
    setBlob(null);
    setUrl(null);
    setSecs(0);
    start();
  }

  /** Arquivo pronto para upload, com extensão coerente com o mime gravado. */
  function toFile() {
    if (!blob) return null;
    const mime = mimeRef.current || blob.type;
    const ext = mime.includes('ogg') ? 'ogg' : 'm4a';
    return new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
  }

  return {
    state, secs, url, blob,
    isBusy: state !== 'idle',
    start, pause, resume, stop, cancel, redo, toFile,
  };
}
