// Bus de eventos simples para toasts de UI (erros/sucessos de formularios).
// O UIToastContainer escuta estes eventos e renderiza.

const EVENT = 'iastudio:ui-toast';

export function emitToast(type, message, opts = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, {
    detail: { type, message, ...opts },
  }));
}

export const toast = {
  success: (msg, opts) => emitToast('success', msg, opts),
  error:   (msg, opts) => emitToast('error',   msg, opts),
  info:    (msg, opts) => emitToast('info',    msg, opts),
  warn:    (msg, opts) => emitToast('warn',    msg, opts),
};

export const TOAST_EVENT = EVENT;
