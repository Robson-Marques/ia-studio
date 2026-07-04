import React from 'react';
import clsx from 'clsx';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

export function Table({ children, className, fixed }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className={clsx('w-full text-left', fixed && 'table-fixed')}>{children}</table>
    </div>
  );
}

export function Thead({ children }) {
  return (
    <thead style={{ borderBottom: '1px solid var(--ap-border)', backgroundColor: 'var(--ap-table-head)' }}>
      <tr>{children}</tr>
    </thead>
  );
}

// Th comum OU ordenavel (sortKey + sort {key, order} + onSort).
export function Th({ children, className, sortKey, sort, onSort }) {
  if (!sortKey || !onSort) {
    return <th className={clsx('table-th', className)}>{children}</th>;
  }
  const active = sort?.key === sortKey;
  const Icon = active ? (sort.order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th className={clsx('table-th', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:opacity-80 select-none"
        style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}
      >
        {children}
        <Icon size={12} style={{ opacity: active ? 0.9 : 0.35, flexShrink: 0 }} />
      </button>
    </th>
  );
}

export function Tbody({ children }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children, onClick }) {
  return (
    <tr
      className={clsx('table-row', onClick && 'cursor-pointer')}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className }) {
  return <td className={clsx('table-td', className)}>{children}</td>;
}

export function Badge({ children, variant = 'gray' }) {
  return <span className={`badge-${variant}`}>{children}</span>;
}

export function Pagination({ page, total, perPage = 10, onPage }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;

  // Janela deslizante de ate 5 numeros + setas + atalho primeira/ultima.
  const WINDOW = 5;
  let start = Math.max(1, page - Math.floor(WINDOW / 2));
  const end = Math.min(pages, start + WINDOW - 1);
  start = Math.max(1, end - WINDOW + 1);
  const nums = [];
  for (let p = start; p <= end; p++) nums.push(p);
  const go = (p) => onPage?.(Math.min(pages, Math.max(1, p)));

  return (
    <div
      className="flex items-center justify-between px-4 py-3 transition-colors"
      style={{ borderTop: '1px solid var(--ap-border)' }}
    >
      <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total} registros
      </p>
      <div className="flex items-center gap-1">
        <PageBtn onClick={() => go(page - 1)} disabled={page <= 1}>‹</PageBtn>
        {start > 1 && (
          <>
            <PageBtn onClick={() => go(1)}>1</PageBtn>
            {start > 2 && <span className="px-0.5 text-xs" style={{ color: 'var(--ap-text-4)' }}>…</span>}
          </>
        )}
        {nums.map((p) => (
          <PageBtn key={p} onClick={() => go(p)} active={p === page}>{p}</PageBtn>
        ))}
        {end < pages && (
          <>
            {end < pages - 1 && <span className="px-0.5 text-xs" style={{ color: 'var(--ap-text-4)' }}>…</span>}
            <PageBtn onClick={() => go(pages)}>{pages}</PageBtn>
          </>
        )}
        <PageBtn onClick={() => go(page + 1)} disabled={page >= pages}>›</PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ children, onClick, active, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-7 h-7 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-default',
        active ? 'bg-brand text-white' : 'hover:bg-brand/10',
      )}
      style={!active ? { color: 'var(--ap-text-4)' } : {}}
    >
      {children}
    </button>
  );
}
