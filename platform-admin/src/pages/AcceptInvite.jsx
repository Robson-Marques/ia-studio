import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Field, Input, Button, DSIcon, useToast } from '@studio-ux-ds/react';
import { acceptInvite } from '../services/invites';

// Rota PÚBLICA `/convite/:token` — a pessoa convidada cria nome e senha aqui.
// Migrada pro DS na v0.10.16.
//
// Segunda tela que um estranho vê (a primeira é o login), e a única em que
// alguém de fora escreve no sistema. Mesma casca do login: fora do AppShell,
// centralizada, `Card` + `Field` + `Input` + `Button block` do DS.
export default function AcceptInvite() {
  const toast = useToast();
  const { token } = useParams();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function aceitar(e) {
    e.preventDefault();
    if (!nome.trim()) { toast.error('Informe seu nome.'); return; }
    if (!senha || senha.length < 8) { toast.error('A senha precisa de pelo menos 8 caracteres.'); return; }
    if (senha !== confirmacao) { toast.error('As duas senhas não são iguais.'); return; }
    setSalvando(true);
    try {
      await acceptInvite(token, { name: nome.trim(), password: senha });
      toast.success('Pronto! Agora entre com o seu e-mail e a senha que você criou.');
      navigate('/login', { replace: true });
    } catch (err) {
      // Convite vencido, cancelado ou já usado cai aqui — a mensagem vem do
      // servidor porque só ele sabe qual dos três é.
      toast.error(err.message || 'Não foi possível aceitar este convite.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center p-4"
      style={{ minHeight: '100dvh', background: 'var(--su-surface-base)' }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Card>
          <div style={{ padding: 32 }}>
            <div className="flex flex-col items-center" style={{ marginBottom: 24 }}>
              <span style={{ color: 'var(--su-action)', marginBottom: 8 }}>
                <DSIcon name="spark" size="lg" />
              </span>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>IA Studio</h1>
              <p style={{ fontSize: 13, margin: '4px 0 0', textAlign: 'center', color: 'var(--su-text-muted)' }}>
                Você foi convidado. Escolha uma senha para entrar.
              </p>
            </div>

            <form onSubmit={aceitar} className="space-y-4">
              <Field label="Seu nome">
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" autoFocus />
              </Field>
              <Field label="Senha" hint="Pelo menos 8 caracteres.">
                <Input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Repita a senha">
                <Input
                  type="password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </Field>
              <Button type="submit" variant="primary" loading={salvando} block>
                Criar meu acesso
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
