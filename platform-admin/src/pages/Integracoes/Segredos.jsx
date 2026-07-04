import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCcw } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput } from '../../components/ui/FormField';
import { listSecrets, rotateSecret } from '../../services/integrations';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { toast } from '../../lib/toast';
import { SECRET_KIND_LABELS } from './integration.constants';

// Cofre de Segredos (diretriz 5): lista SOMENTE metadados — o valor cifrado
// nunca sai por HTTP. Ação disponível: rotacionar (novos valores).
export default function Segredos() {
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(null); // segredo em rotação (form)

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listSecrets();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Cofre de Segredos</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Credenciais cifradas (AES-256-GCM). Apenas metadados são exibidos — valores nunca saem do cofre.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon={KeyRound} title="Cofre vazio" description="Segredos são criados automaticamente pelo wizard de conexão." />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <Table>
            <Thead>
              <Th>Nome</Th>
              <Th>Tipo</Th>
              <Th>Campos</Th>
              <Th>Rotacionado em</Th>
              <Th>Criado em</Th>
              <Th className="text-right">Ações</Th>
            </Thead>
            <Tbody>
              {items.map((s) => (
                <Tr key={s.id}>
                  <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{s.name}</span></Td>
                  <Td><Badge variant="purple">{SECRET_KIND_LABELS[s.kind] || s.kind}</Badge></Td>
                  <Td>
                    <div className="flex gap-1 flex-wrap">
                      {(s.fields || []).map((f) => <Badge key={f} variant="gray">{f}</Badge>)}
                    </div>
                  </Td>
                  <Td>{s.rotated_at ? formatDateTime(s.rotated_at) : 'nunca'}</Td>
                  <Td>{formatDateTime(s.created_at)}</Td>
                  <Td className="text-right">
                    {can('integrations.secrets.manage') && (
                      <button
                        className="btn-ghost p-1.5"
                        title="Rotacionar: substitui os valores por novos"
                        onClick={() => setRotating(s)}
                      >
                        <RefreshCcw size={14} className="text-brand" />
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <RotateSecretModal
        secret={rotating}
        onClose={() => setRotating(null)}
        onRotated={() => { setRotating(null); load(); }}
      />
    </div>
  );
}

function RotateSecretModal({ secret, onClose, onRotated }) {
  const [values, setValues] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues({});
    setConfirming(false);
  }, [secret?.id]);

  if (!secret) return null;
  const fields = secret.fields?.length ? secret.fields : ['value'];

  function requestRotate() {
    const missing = fields.filter((f) => !String(values[f] ?? '').trim());
    if (missing.length) {
      toast.error(`Preencha o novo valor de: ${missing.join(', ')}.`);
      return;
    }
    setConfirming(true);
  }

  async function handleRotate() {
    setSaving(true);
    try {
      await rotateSecret(secret.id, values);
      toast.success('Segredo rotacionado com sucesso.');
      onRotated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Modal
        open={Boolean(secret)}
        onClose={saving ? undefined : onClose}
        dismissable={!saving}
        title={`Rotacionar — ${secret.name}`}
        size="md"
        footer={
          <>
            <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn-primary disabled:opacity-60" onClick={requestRotate} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />} Rotacionar
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            A rotação substitui TODOS os valores deste segredo. Conexões que o utilizam passam a usar os novos
            valores imediatamente — teste a conexão após rotacionar.
          </p>
          {fields.map((f) => (
            <FormField key={f} label={`Novo valor — ${f}`} required>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={values[f] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f]: e.target.value }))}
              />
            </FormField>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        danger
        loading={saving}
        title="Confirmar rotação"
        message={`Substituir os valores do segredo "${secret.name}"? Os valores antigos são descartados e não podem ser recuperados.`}
        confirmLabel="Rotacionar"
        onClose={() => setConfirming(false)}
        onConfirm={handleRotate}
      />
    </>
  );
}
