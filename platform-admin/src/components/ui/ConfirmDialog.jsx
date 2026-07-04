import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({
  open, onClose, onConfirm,
  title = 'Confirmar',
  message = 'Tem certeza?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
}) {
  return (
    <Modal
      open={open} onClose={loading ? undefined : onClose} size="sm" title={title}
      footer={
        <>
          <button
            onClick={onClose} disabled={loading}
            className="btn-secondary disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm} disabled={loading}
            className={danger
              ? 'px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed'
              : 'btn-primary disabled:opacity-60'}
          >
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {danger && <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ap-text-2)' }}>{message}</p>
      </div>
    </Modal>
  );
}
