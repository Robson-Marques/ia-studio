import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { TOAST_EVENT } from '../../lib/toast';

const ACCENT = {
  success: { icon: CheckCircle2,  color: '#10b981' },
  error:   { icon: AlertCircle,   color: '#ef4444' },
  warn:    { icon: AlertTriangle, color: '#f59e0b' },
  info:    { icon: Info,          color: '#3b82f6' },
};

const DEFAULT_DURATION = { success: 7000, info: 7000, warn: 8000, error: 10000 };

export default function UIToastContainer() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    function handler(e) {
      const { type = 'info', message = '' } = e.detail || {};
      const duration = e.detail?.duration ?? DEFAULT_DURATION[type] ?? 7000;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, type, message, duration }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), duration);
    }
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  function dismiss(id) { setItems((prev) => prev.filter((i) => i.id !== id)); }

  return (
    // top/right via env(safe-area-inset-*) pra nao cobrir notch/Dynamic Island.
    <div
      className="fixed z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none"
      style={{
        top:   'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))',
        right: 'max(1rem, calc(env(safe-area-inset-right) + 0.5rem))',
      }}
    >
      {items.map((t) => {
        const a = ACCENT[t.type] || ACCENT.info;
        const Icon = a.icon;
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl relative overflow-hidden"
            style={{
              backgroundColor: 'var(--ap-surface)',
              border: '1px solid var(--ap-border)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.25), inset 4px 0 0 0 ' + a.color,
              color: 'var(--ap-text-1)',
              minWidth: 280,
            }}
          >
            <Icon size={18} style={{ color: a.color }} className="shrink-0 mt-0.5" />
            <p className="text-sm flex-1 leading-relaxed" style={{ color: 'var(--ap-text-1)' }}>{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="transition-colors shrink-0"
              style={{ color: 'var(--ap-text-4)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ap-text-1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ap-text-4)'; }}
              aria-label="Fechar"
            >
              <X size={15} />
            </button>
            <div
              className="absolute bottom-0 left-0 h-0.5"
              style={{
                background: a.color,
                animation: 'toastProgress ' + t.duration + 'ms linear forwards',
              }}
            />
          </div>
        );
      })}
      <style>{`
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
