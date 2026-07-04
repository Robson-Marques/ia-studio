import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../lib/toast';
import { getChatTimeline } from '../../services/whatsapp';
import { formatDateTime } from '../../lib/format';

const EVENT_LABEL = {
  CLAIMED: 'Assumida',
  RELEASED: 'Liberada pro pool',
  TRANSFERRED: 'Transferida',
  CLOSED: 'Encerrada',
  REOPENED: 'Reaberta',
  TAKEOVER: 'Assumida de outro atendente',
};

const ACTOR_LABEL = { USER: 'Atendente', SYSTEM: 'Sistema', BOT: 'IA' };

// Trilha de atendimento da conversa (comm_whatsapp_chat_events).
export default function TimelineModal({ open, chat, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !chat) return;
    setLoading(true);
    getChatTimeline(chat.id)
      .then(setItems)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [open, chat?.id]);

  return (
    <Modal open={open} onClose={onClose} title="Trilha de atendimento" size="lg"
      footer={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      {loading && <div className="py-8 text-center"><Loader2 size={18} className="animate-spin inline" /></div>}
      {!loading && items.length === 0 && (
        <EmptyState title="Sem eventos" description="Nenhuma ação de atendimento registrada nesta conversa ainda." />
      )}
      {!loading && items.length > 0 && (
        <ol className="space-y-3">
          {items.map((ev) => (
            <li key={ev.id} className="flex gap-3">
              <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-brand" />
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--ap-text-1)' }}>
                  {EVENT_LABEL[ev.event_type] || ev.event_type}
                </p>
                <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                  {formatDateTime(ev.created_at)} — {ACTOR_LABEL[ev.actor_type] || ev.actor_type}
                  {ev.reason ? ` — motivo: ${ev.reason}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
