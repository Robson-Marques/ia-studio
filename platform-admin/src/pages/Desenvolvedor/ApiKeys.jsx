import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Plus, Ban, Copy, Check, ShieldAlert } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import { Table, Thead, Th, Tbody, Tr, Td, Badge } from '../../components/ui/Table';
import { FormField, TextInput } from '../../components/ui/FormField';
import { useToast } from '@studio-ux-ds/react';
import { listApiKeys, createApiKey, revokeApiKey } from '../../services/developer';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';

// Desenvolvedor → API Keys: lista metadados (nunca a chave), criação exibe a
// chave em claro UMA vez (com aviso + copiar) e revogação com os 5 patrasques.
export default function ApiKeys() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState(null); // { key, plaintext }
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const canManage = can('developer.apikeys.manage');

  async function load() {
    setLoading(true);
    try {
      const { items: list } = await listApiKeys();
      setItems(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function keyStatus(k) {
    if (k.revoked_at) return { variant: 'red', label: 'Revogada' };
    if (k.expires_at && new Date(k.expires_at).getTime() < Date.now()) return { variant: 'yellow', label: 'Expirada' };
    return { variant: 'green', label: 'Ativa' };
  }

  async function handleRevoke() {
    if (!confirmRevoke) return;
    setRevoking(true);
    try {
      await revokeApiKey(confirmRevoke.id);
      toast.success('Chave revogada.');
      setConfirmRevoke(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Chaves de API</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
            Autenticam chamadas à API pública. A chave em claro é exibida uma única vez na criação — depois só os metadados.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Nova chave
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} /></div>
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon={KeyRound} title="Nenhuma chave de API" description="Crie uma chave para autenticar integrações com a API pública." />
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="card p-0 overflow-hidden hidden md:block">
            <Table>
              <Thead>
                <Th>Nome</Th>
                <Th>Prefixo</Th>
                <Th>Escopos</Th>
                <Th>Status</Th>
                <Th>Último uso</Th>
                <Th>Expira em</Th>
                <Th className="text-right">Ações</Th>
              </Thead>
              <Tbody>
                {items.map((k) => {
                  const st = keyStatus(k);
                  return (
                    <Tr key={k.id}>
                      <Td><span className="font-medium" style={{ color: 'var(--ap-text-1)' }}>{k.name}</span></Td>
                      <Td><span className="font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>ias_{k.prefix}_…</span></Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          {(k.scopes || []).length
                            ? k.scopes.map((s) => <Badge key={s} variant="blue">{s}</Badge>)
                            : <span className="text-xs" style={{ color: 'var(--ap-text-5)' }}>—</span>}
                        </div>
                      </Td>
                      <Td><Badge variant={st.variant}>{st.label}</Badge></Td>
                      <Td><span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{k.last_used_at ? formatDateTime(k.last_used_at) : 'nunca'}</span></Td>
                      <Td><span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{k.expires_at ? formatDateTime(k.expires_at) : 'não expira'}</span></Td>
                      <Td className="text-right">
                        {canManage && !k.revoked_at && (
                          <button className="btn-ghost p-1.5" title="Revogar chave" onClick={() => setConfirmRevoke(k)}>
                            <Ban size={14} className="text-red-500" />
                          </button>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {items.map((k) => {
              const st = keyStatus(k);
              return (
                <div key={k.id} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: 'var(--ap-text-1)' }}>{k.name}</p>
                      <p className="text-[11px] font-mono" style={{ color: 'var(--ap-text-5)' }}>ias_{k.prefix}_…</p>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ap-text-4)' }}>
                    Último uso: {k.last_used_at ? formatDateTime(k.last_used_at) : 'nunca'} · Expira: {k.expires_at ? formatDateTime(k.expires_at) : 'não expira'}
                  </p>
                  {canManage && !k.revoked_at && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--ap-border-sub)' }}>
                      <button className="btn-ghost p-2" onClick={() => setConfirmRevoke(k)}>
                        <Ban size={16} className="text-red-500" /> <span className="text-xs">Revogar</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <CreateApiKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(res) => { setCreateOpen(false); setNewKey(res); load(); }}
      />

      <NewKeyModal newKey={newKey} onClose={() => setNewKey(null)} />

      {/* Revogar — 5 patrasques: ConfirmDialog + disclaimer + tooltip + loading + permission gate */}
      <ConfirmDialog
        open={Boolean(confirmRevoke)}
        danger
        loading={revoking}
        title="Revogar chave de API"
        message={confirmRevoke
          ? `Revogar a chave "${confirmRevoke.name}" (ias_${confirmRevoke.prefix}_…)? Toda integração que a utiliza deixará de autenticar imediatamente. A revogação é permanente — a chave nunca volta a funcionar.`
          : ''}
        confirmLabel="Revogar"
        onClose={() => setConfirmRevoke(null)}
        onConfirm={handleRevoke}
      />
    </div>
  );
}

// Criação da chave — nome, escopos (CSV), expiração opcional.
function CreateApiKeyModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', scopes: '', expires_at: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', scopes: '', expires_at: '' }); }, [open]);

  const patch = (p) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (form.name.trim().length < 2) { toast.error('Informe um nome (mín. 2 caracteres).'); return; }
    const scopes = form.scopes.split(',').map((s) => s.trim()).filter(Boolean);
    let expiresAt;
    if (form.expires_at) {
      const d = new Date(form.expires_at);
      if (Number.isNaN(d.getTime())) { toast.error('Data de expiração inválida.'); return; }
      expiresAt = d.toISOString();
    }
    setSaving(true);
    try {
      const res = await createApiKey({
        name: form.name.trim(),
        scopes: scopes.length ? scopes : undefined,
        expires_at: expiresAt,
      });
      toast.success('Chave criada. Copie-a agora.');
      onCreated(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Nova chave de API"
      size="md"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Criar chave
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Nome" required hint="Identifica a chave na listagem (ex.: Integração ERP).">
          <TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Integração ERP" />
        </FormField>
        <FormField label="Escopos" hint="Separados por vírgula (ex.: public.read, public.write). Vazio = sem escopo explícito.">
          <TextInput value={form.scopes} onChange={(e) => patch({ scopes: e.target.value })} placeholder="public.read, public.write" />
        </FormField>
        <FormField label="Expira em" hint="Opcional. Vazio = não expira.">
          <TextInput type="date" value={form.expires_at} onChange={(e) => patch({ expires_at: e.target.value })} />
        </FormField>
      </div>
    </Modal>
  );
}

// Exibe a chave em claro UMA vez com aviso + botão copiar.
function NewKeyModal({ newKey, onClose }) {
  const [copied, setCopied] = useState(false);
  const plaintext = newKey?.plaintext || '';

  useEffect(() => { if (newKey) setCopied(false); }, [newKey]);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plaintext);
      } else {
        const ta = document.createElement('textarea');
        ta.value = plaintext;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success('Chave copiada.');
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  }

  return (
    <Modal
      open={Boolean(newKey)}
      onClose={onClose}
      title="Chave criada"
      size="md"
      dismissable={false}
      footer={<button className="btn-primary" onClick={onClose}>Já copiei — fechar</button>}
    >
      <div className="space-y-3">
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ backgroundColor: 'var(--ap-surface-2)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)' }}
        >
          <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <span><strong>Copie agora — a chave não será exibida de novo.</strong> Guarde-a em local seguro; só armazenamos o prefixo e um hash.</span>
        </div>
        <FormField label={newKey?.key?.name ? `Chave "${newKey.key.name}"` : 'Chave em claro'}>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={plaintext}
              onFocus={(e) => e.target.select()}
              className="input font-mono text-xs flex-1"
            />
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={copy}
              title="Copiar a chave"
            >
              {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </FormField>
      </div>
    </Modal>
  );
}
