import React, { useEffect, useState } from 'react';
import Modal from '../../components/ui/Modal';
import Tabs from '../../components/ui/Tabs';
import { FormField, Select, TextInput } from '../../components/ui/FormField';
import { useToast } from '@studio-ux-ds/react';
import { listAttendanceUsers, listQueues, listTeams, transferChat } from '../../services/whatsapp';

const TARGET_TABS = [
  { id: 'user', label: 'Atendente' },
  { id: 'queue', label: 'Fila' },
  { id: 'team', label: 'Equipe' },
];

// Transferência de conversa: pra atendente (IN_PROGRESS), fila ou equipe
// (volta pro pool OPEN da fila). Lock otimista no backend → 409 vira toast.
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
    ]).then(([u, q, t]) => {
      setUsers(u);
      setQueues(q);
      setTeams(t);
    });
  }, [open]);

  async function handleConfirm() {
    if (!targetId) { toast.error('Selecione o destino da transferência.'); return; }
    setSaving(true);
    try {
      await transferChat(chat.id, { type: tab, id: targetId, reason: reason || undefined });
      toast.success('Conversa transferida.');
      onDone();
    } catch (err) {
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
      size="md"
      footer={
        <>
          <button className="btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={saving} onClick={handleConfirm}>
            {saving ? 'Transferindo…' : 'Transferir'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--ap-text-3)' }}>
          Pra atendente: a conversa vira dele na hora. Pra fila/equipe: volta pro pool (aberta, sem atendente).
        </p>
        <Tabs items={TARGET_TABS} active={tab} onChange={(t) => { setTab(t); setTargetId(''); }} variant="pills" bleed={false} />
        <FormField label={tab === 'user' ? 'Atendente' : tab === 'queue' ? 'Fila' : 'Equipe'} required>
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Selecione…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.email ? ` (${o.email})` : ''}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Motivo (opcional)" hint="Fica registrado na trilha de atendimento.">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </FormField>
      </div>
    </Modal>
  );
}
