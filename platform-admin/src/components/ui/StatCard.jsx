import React from 'react';
import clsx from 'clsx';

const palette = {
  brand:  { grad: 'from-indigo-500/20 to-indigo-600/5', border: 'border-indigo-500/20', icon: 'text-indigo-400', iconBg: 'bg-indigo-500/10' },
  green:  { grad: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-500/20', icon: 'text-emerald-500', iconBg: 'bg-emerald-500/10' },
  blue:   { grad: 'from-blue-500/20 to-blue-600/5', border: 'border-blue-500/20', icon: 'text-blue-500', iconBg: 'bg-blue-500/10' },
  yellow: { grad: 'from-amber-500/20 to-amber-600/5', border: 'border-amber-500/20', icon: 'text-amber-500', iconBg: 'bg-amber-500/10' },
  red:    { grad: 'from-red-500/20 to-red-600/5', border: 'border-red-500/20', icon: 'text-red-500', iconBg: 'bg-red-500/10' },
  purple: { grad: 'from-violet-500/20 to-violet-600/5', border: 'border-violet-500/20', icon: 'text-violet-500', iconBg: 'bg-violet-500/10' },
};

export default function StatCard({ label, value, sub, icon: Icon, color = 'brand', trend }) {
  const p = palette[color] ?? palette.brand;

  return (
    <div className={clsx('card bg-gradient-to-br p-5 flex items-start gap-4', p.grad, p.border)}>
      {Icon && (
        <div className={clsx('p-2.5 rounded-xl', p.iconBg, p.icon)}>
          <Icon size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ap-text-4)' }}>
          {label}
        </p>
        <p className="text-2xl font-bold mt-1 leading-none" style={{ color: 'var(--ap-text-1)' }}>
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--ap-text-5)' }}>{sub}</p>
        )}
        {trend !== undefined && (
          <p className={clsx('text-xs mt-1.5 font-medium', trend >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs mês anterior
          </p>
        )}
      </div>
    </div>
  );
}
