import React, { useEffect, useState } from 'react';
import { Modal, Tabs, Field, Input, Select, Button, useToast } from '@studio-ux-ds/react';
import { listAttendanceUsers, listQueues, listTeams, transferChat } from '../../services/whatsapp';

// WhatsApp/TransferModal — passar a conversa para outra pessoa, fila ou equipe.
// Migrado pro DS na v0.10.9. Segue Modal: campos de resposta curta (abas + select
// + um campo de motivo), nenhum texto longo.

const TARGET_TABS = [
  { id: 'user', label: 'Uma pessoa' },
  { id: 'queue', label: 'Uma fila' },
  { id: 'team', label: 'Uma equipe' },
];

const LABEL = { user: 'Quem vai atender', queue: 'Para qual fila', team: 'Para qual equipe' };

export default function TransferModal({ open, chat, onClose, onDone }) {
  const toast = useToast();
  const [tab, setTab] = useState('user');
  const [users, setUsers] = useState([]);
  const [queues, setQueues] = useState([]);
  const [teams, setTeams] = useState([]);
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTargetId('');
    setReason('');
    Promise.all([
      listAttendanceUsers().catch(() => []),
      listQueues().catch(() => []),
      listTeams().catch(() => []),
    ]).then(([u, q, t]) => { setUsers(u); setQueues(q); setTeams(t); });
  }, [open]);

  async function handleConfirm() {
    if (!targetId) { toast.error('Escolha para quem vai a conversa.'); return; }
    setSaving(true);
    try {
      await transferChat(chat.id, { type: tab, id: targetId, reason: reason || undefined });
      toast.success('Conversa transferida.');
      onDone();
    } catch (err) {
      // O backend usa trava otimista: se alguém mexeu na conversa nesse meio-tempo,
      // devolve 409 e o toast conta o que aconteceu.
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const options = tab === 'user' ? users : tab === 'queue' ? queues : teams;

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Transferir conversa"
      maxWidth={520}
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} onClick={handleConfirm}>Transferir</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
          Para uma <strong>pessoa</strong>: a conversa passa a ser dela na hora. Para uma <strong>fila</strong> ou
          <strong> equipe</strong>: volta a ficar sem dono, esperando alguém assumir.
        </p>

        <Tabs variant="pills" items={TARGET_TABS} value={tab} onChange={(t) => { setTab(t); setTargetId(''); }} />

        <Field label={LABEL[tab]} required>
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Escolha…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.email ? ` (${o.email})` : ''}</option>
            ))}
          </Select>
        </Field>

        {!options.length && (
          <p style={{ fontSize: 12, margin: 0, color: 'var(--su-warning-fg)' }}>
            {tab === 'user'
              ? 'Ninguém com permissão de atendimento além de você.'
              : 'Nada cadastrado ainda — crie em WhatsApp → Equipes e Filas.'}
          </p>
        )}

        <Field label="Motivo" hint="Opcional. Fica registrado no histórico da conversa.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}
