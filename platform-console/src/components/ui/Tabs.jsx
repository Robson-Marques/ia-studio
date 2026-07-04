// Tabs reusable — PADRAO UNICO de abas. Dois niveis:
//   variant="folder" (padrao) → ABA PRINCIPAL ("aba de pasta").
//   variant="pills" → SUB-ABA (pilula preenchida no accent).
//
// Uso:
//   const TABS = [{ id: 'dados', label: 'Dados', Icon: User }];
//   <Tabs items={TABS} active={tab} onChange={setTab} />
import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';

const ACCENT = 'var(--ap-accent, #8b5cf6)';

export default function Tabs({ items, active, onChange, variant = 'folder', bleed = true, className }) {
  const tabsRef = useRef(null);
  const pills = variant === 'pills';

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.querySelector('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  const containerStyle = pills ? undefined : { borderBottom: '1px solid var(--ap-border)' };

  const btnStyle = (on) => {
    if (pills) {
      return on
        ? { background: ACCENT, color: '#fff', borderRadius: 8 }
        : { background: 'transparent', color: 'var(--ap-text-3)', borderRadius: 8 };
    }
    return on ? {
      background: 'var(--ap-surface)', color: 'var(--ap-text-1)',
      borderTop: `2px solid ${ACCENT}`,
      borderLeft: '1px solid var(--ap-border)', borderRight: '1px solid var(--ap-border)',
      borderBottom: '1px solid var(--ap-surface)',
      borderTopLeftRadius: 8, borderTopRightRadius: 8, marginBottom: -1,
    } : {
      background: 'transparent', color: 'var(--ap-text-3)',
      borderTop: '2px solid transparent', borderTopLeftRadius: 8, borderTopRightRadius: 8,
    };
  };

  return (
    <>
      <style>{`
        .ap-tab-scroll::-webkit-scrollbar { display: none; }
        .ap-tab-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      <div
        ref={tabsRef}
        className={clsx(
          'ap-tab-scroll flex gap-1 mb-4 overflow-x-auto scroll-smooth',
          pills ? 'items-center' : 'items-end',
          bleed && '-mx-5 px-5',
          className,
        )}
        style={containerStyle}
      >
        {items.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              data-active={on}
              onClick={() => onChange(id)}
              className={clsx(
                'flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors text-xs font-semibold',
                pills ? 'px-3 py-1.5' : 'px-3.5 py-2',
                !on && 'hover:opacity-100 opacity-70',
              )}
              style={btnStyle(on)}
            >
              {Icon && <Icon size={14} />}
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
