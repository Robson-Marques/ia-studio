import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Nada por aqui', description, icon: Icon = Inbox, action }) {
  return (
    <div className="py-12 text-center">
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
        style={{ backgroundColor: 'var(--ap-surface-3)' }}
      >
        <Icon size={20} style={{ color: 'var(--ap-text-4)' }} />
      </div>
      <h4 className="text-sm font-semibold" style={{ color: 'var(--ap-text-1)' }}>{title}</h4>
      {description && (
        <p className="text-xs mt-1" style={{ color: 'var(--ap-text-4)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
