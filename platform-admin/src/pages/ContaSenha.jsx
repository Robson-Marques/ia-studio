import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, Field, Input, Button, useToast } from '@studio-ux-ds/react';
import { useAuth } from '../context/AuthContext';

// ContaSenha — rota /conta/senha. Substitui o ChangePasswordModal do Header
// legado (passo 4 da adoção do Studio UX, 2026-07-24): elimina modal-cross-tree
// no shell (Header abria modal fora do <Outlet/>, potencial empilhamento com
// modal de página filha). Agora é uma rota dedicada dentro do Outlet do
// AppShell — sem empilhamento. Menu do usuário aponta pra cá.

export default function ContaSenha() {
  const toast = useToast();
  const navigate = useNavigate();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e?.preventDefault?.();
    if (!current) { toast.error('Informe a senha atual.'); return; }
    if (!next || next.length < 8) { toast.error('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (next !== confirm) { toast.error('A confirmação não confere com a nova senha.'); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success('Senha alterada com sucesso.');
      navigate('/minha-conta');
    } catch (err) {
      toast.error(err.message || 'Erro ao trocar a senha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trocar senha"
        subtitle="Escolha uma senha nova. Mínimo de 8 caracteres."
      />

      <Card>
        <form onSubmit={handleSave} style={{ padding: 20, maxWidth: 480 }} className="space-y-4">
          <Field label="Senha atual" required>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={saving}
            />
          </Field>
          <Field label="Nova senha" required hint="Mínimo de 8 caracteres.">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </Field>
          <Field label="Confirmar nova senha" required>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              disabled={saving}
            />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => navigate('/minha-conta')} disabled={saving}>
              Cancelar
            </Button>
            {/* `loading` do DS (v1.2.13) monta o spinner na escala e na cor do
                botão, e já desabilita + marca `aria-busy`. Aqui havia um spinner
                montado à mão com margem cravada — o anti-padrão que a prop
                existe pra eliminar. */}
            <Button variant="primary" type="submit" loading={saving}>
              Salvar nova senha
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
