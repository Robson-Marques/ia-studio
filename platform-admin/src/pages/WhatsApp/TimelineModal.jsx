import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, EmptyState, Timeline, Button, useToast } from '@studio-ux-ds/react';
import { getChatTimeline } from '../../services/whatsapp';
import { formatDateTime } from '../../lib/format';

// WhatsApp/TimelineModal — o histórico de atendimento da conversa (quem assumiu,
// transferiu, encerrou). Migrado pro DS na v0.10.9: a lista feita à mão com
// bolinha `bg-brand` virou o `Timeline` do DS, que é o componente de histórico do
// catálogo. Segue Modal — é leitura, sem campo nenhum.

const EVENT_LABEL = {
  CLAIMED: 'Assumiu a conversa',
  RELEASED: 'Devolveu para o grupo',
  TRANSFERRED: 'Transferiu',
  CLOSED: 'Encerrou',
  REOPENED: 'Reabriu',
  TAKEOVER: 'Assumiu de outra pessoa',
};

const ACTOR_LABEL = { USER: 'atendente', SYSTEM: 'sistema', BOT: 'IA' };

export default function TimelineModal({ open, chat, onClose }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !chat) return;
    setLoading(true);
    getChatTimeline(chat.id)
      .then(setItems)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [open, chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Histórico do atendimento"
      maxWidth={640}
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      )}

      {!loading && !items.length && (
        <EmptyState
          icon="history"
          title="Nada registrado ainda"
          description="Quando alguém assumir, transferir ou encerrar esta conversa, aparece aqui."
        />
      )}

      {!loading && items.length > 0 && (
        <Timeline
          items={items.map((ev) => ({
            title: EVENT_LABEL[ev.event_type] || ev.event_type,
            meta: [
              formatDateTime(ev.created_at),
              ACTOR_LABEL[ev.actor_type] || ev.actor_type,
              ev.reason ? `motivo: ${ev.reason}` : null,
            ].filter(Boolean).join(' · '),
          }))}
        />
      )}
    </Modal>
  );
}
