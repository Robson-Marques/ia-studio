// Player de áudio customizado pra mensagens de WhatsApp — barra de progresso
// + tempo. Resolve a duração via AudioContext porque o <audio> devolve
// Infinity/NaN pra blobs do MediaRecorder.
// Portado do Aquapark. Os glifos de tocar/pausar vêm do DS (v1.2.41) — antes
// vinham de outra biblioteca, com traço e grade diferentes dos do resto da tela.
import React, { useRef, useState, useEffect, useCallback } from 'react';

async function resolveAudioDuration(src) {
  try {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return 0;
    const ctx = new Ctx();
    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    ctx.close();
    return decoded.duration;
  } catch {
    return 0;
  }
}

export default function AudioPlayer({ src, light = false }) {
  const audioRef        = useRef(null);
  const rafRef          = useRef(0);
  const resolvingRef    = useRef(false);
  const realDurationRef = useRef(0);

  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(0);

  const fmtTime = (s) => {
    if (!s || !isFinite(s) || isNaN(s)) return '0:00';
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const effectiveDuration = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return realDurationRef.current;
    return (isFinite(audio.duration) && audio.duration > 0)
      ? audio.duration
      : realDurationRef.current;
  }, []);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    const d = effectiveDuration();
    setCurrent(t);
    if (d > 0) setProgress((t / d) * 100);
    rafRef.current = requestAnimationFrame(tick);
  }, [effectiveDuration]);

  const ensureDuration = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isFinite(audio.duration) && audio.duration > 0) {
      realDurationRef.current = audio.duration;
      setDuration(audio.duration);
      return;
    }
    if (realDurationRef.current > 0) return;
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const d = await resolveAudioDuration(src);
      if (d > 0) {
        realDurationRef.current = d;
        setDuration(d);
      }
    } finally {
      resolvingRef.current = false;
    }
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setProgress(0);
    setCurrent(0);
    setDuration(0);
    realDurationRef.current = 0;
    resolvingRef.current = false;

    const onDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        realDurationRef.current = audio.duration;
        setDuration(audio.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      setProgress(0);
      setCurrent(0);
    };
    const onLoaded = () => { ensureDuration(); };

    audio.addEventListener('durationchange',  onDurationChange);
    audio.addEventListener('ended',           onEnd);
    audio.addEventListener('loadedmetadata',  onLoaded);
    if (audio.readyState >= 1) ensureDuration();

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended',          onEnd);
      audio.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [src, ensureDuration]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }
    await ensureDuration();
    try {
      await audio.play();
      setPlaying(true);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    } catch { /* autoplay blocked */ }
  }

  function seek(e) {
    const audio = audioRef.current;
    const d = effectiveDuration();
    if (!audio || d <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * d;
    setProgress(pct * 100);
    setCurrent(audio.currentTime);
  }

  const btnCls = light
    ? 'w-7 h-7 rounded-full bg-white shadow-sm hover:bg-gray-50 text-[#111b21] flex items-center justify-center shrink-0 transition border border-gray-200'
    : 'w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center shrink-0 transition';
  const trackCls = light
    ? 'flex-1 h-1.5 bg-gray-300 rounded-full overflow-hidden cursor-pointer'
    : 'flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer';
  const fillCls = light
    ? 'h-full bg-[#00a884] rounded-full'
    : 'h-full bg-white rounded-full';
  const timeCls = light
    ? 'text-[10px] text-gray-500 shrink-0 w-8 text-right tabular-nums'
    : 'text-[10px] text-white/70 shrink-0 w-8 text-right tabular-nums';

  const displayDuration = duration || realDurationRef.current;

  return (
    <div className="flex items-center gap-2 py-1 min-w-[160px]">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button onClick={togglePlay} className={btnCls} type="button">
        {playing
          ? <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          : <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ marginLeft: 2 }}><path d="M7 4.5c0-.8.9-1.3 1.6-.8l12 7.5a1 1 0 0 1 0 1.6l-12 7.5c-.7.5-1.6 0-1.6-.8v-15Z" /></svg>}
      </button>
      <div className={trackCls} onClick={seek}>
        <div className={fillCls} style={{ width: `${progress}%` }} />
      </div>
      <span className={timeCls}>
        {playing || current > 0 ? fmtTime(current) : fmtTime(displayDuration)}
      </span>
    </div>
  );
}
