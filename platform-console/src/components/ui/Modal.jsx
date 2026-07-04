import React, { useEffect } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';

// Modal global. `dismissable=false` desativa fechar por backdrop/Esc (usado em
// formularios de cadastro/edicao pra evitar perda de dados por toque acidental).
export default function Modal({ open, onClose, title, children, size = 'md', footer, dismissable = true }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape' && dismissable) onClose?.(); }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const widths = {
    sm:    'max-w-sm',
    md:    'max-w-lg',
    lg:    'max-w-2xl',
    xl:    'max-w-4xl',
    '2xl': 'max-w-5xl',
    '3xl': 'max-w-6xl',
    '4xl': 'max-w-7xl',
    full:  'max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-0 md:p-4 overflow-hidden">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
        onClick={dismissable ? onClose : undefined}
      />
      <div
        className={clsx(
          'relative shadow-2xl overflow-hidden flex flex-col',
          // size=sm (confirmacoes): centralizado tambem no mobile.
          size === 'sm'
            ? 'w-[calc(100%-1rem)] max-md:max-h-[90vh] rounded-xl md:max-h-[95vh]'
            // Mobile: full-screen 100dvh. Desktop: centralizado.
            : 'w-full max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none md:rounded-xl md:max-h-[95vh]',
          widths[size] || widths.md,
        )}
        style={{
          backgroundColor: 'var(--ap-surface)',
          border: '1px solid var(--ap-border)',
          color: 'var(--ap-text-1)',
        }}
      >
        {/* Header — padding-top respeita notch/Dynamic Island em PWA standalone. */}
        <div
          className="flex items-center justify-between gap-2 px-2 md:px-5 shrink-0"
          style={{
            borderBottom: '1px solid var(--ap-border)',
            paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
            paddingBottom: '0.75rem',
          }}
        >
          {/* Botao voltar — so no mobile, area de toque grande (44px). */}
          <button
            onClick={onClose}
            className="md:hidden flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium shrink-0 active:bg-black/5"
            style={{ color: 'var(--ap-text-2)' }}
            aria-label="Voltar"
          >
            <ArrowLeft size={18} /> Voltar
          </button>

          <h3 className="text-base font-semibold truncate flex-1 px-1 md:px-0 text-center md:text-left"
            style={{ color: 'var(--ap-text-1)' }}>{title}</h3>

          <button
            onClick={onClose}
            className="hidden md:flex p-1.5 rounded-lg transition-colors shrink-0"
            style={{ color: 'var(--ap-text-4)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--ap-surface-3)'; e.currentTarget.style.color = 'var(--ap-text-1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--ap-text-4)'; }}
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
          <div className="md:hidden w-[88px] shrink-0" aria-hidden />
        </div>
        <div
          className="px-4 md:px-5 py-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0"
          style={!footer ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : undefined}
        >{children}</div>
        {footer && (
          <div
            className="px-4 md:px-5 flex flex-wrap items-center justify-end gap-2 shrink-0"
            style={{
              borderTop: '1px solid var(--ap-border)',
              backgroundColor: 'var(--ap-surface-2)',
              paddingTop: '0.75rem',
              paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
