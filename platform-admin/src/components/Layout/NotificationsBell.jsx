import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { getNotificationsInbox, markNotificationRead, markAllNotificationsRead } from '../../services/automation';
import { usePermissions } from '../../hooks/usePermissions';
import { toast } from '../../lib/toast';
import { formatDateTime } from '../../pages/Automacao/automation.constants';

// Sino do Header (Notification Center — diretriz 22): polling 30s de não
// lidas + dropdown com as últimas notificações in-app do usuário.
export default function NotificationsBell() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  async function load() {
    try {
      const data = await getNotificationsInbox(15);
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch {
      // silencioso — polling não pode virar chuva de toasts
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function handleClick(n) {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead();
      setUnread(0);
      setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost p-2 min-w-[44px] min-h-[44px] justify-center md:min-w-0 md:min-h-0 relative"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: '#ef4444' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 w-80 max-w-[90vw] rounded-xl shadow-xl z-50 overflow-hidden"
          style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}
        >
          <div className="flex items-center gap-2 px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--ap-border)' }}>
            <p className="flex-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>
              Notificações
            </p>
            {unread > 0 && (
              <button className="text-[11px] flex items-center gap-1 text-brand" onClick={handleReadAll} title="Marcar todas como lidas">
                <CheckCheck size={12} /> Marcar lidas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--ap-text-4)' }}>Nenhuma notificação.</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className="w-full text-left px-3 py-2.5 transition-colors hover:bg-brand/5 flex gap-2"
              >
                <span
                  className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: n.read_at ? 'transparent' : 'var(--ap-accent, #6366f1)' }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{n.title}</span>
                  {n.body && <span className="block text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{n.body}</span>}
                  <span className="block text-[10px] mt-0.5" style={{ color: 'var(--ap-text-5)' }}>{formatDateTime(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
          {can('automation.notifications.read') && (
            <button
              className="w-full px-3 py-2 text-xs text-center text-brand"
              style={{ borderTop: '1px solid var(--ap-border)' }}
              onClick={() => { setOpen(false); navigate('/automacao/notificacoes'); }}
            >
              Ver log completo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
