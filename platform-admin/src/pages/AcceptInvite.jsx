import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthScreen, Field, Input, Button, DSIcon, useToast } from '@studio-ux-ds/react';
import { acceptInvite } from '../services/invites';

// Aceitar convite — o mesmo molde de acesso do login (`AuthScreen`), **sem o
// painel de marca**: aqui não há o que argumentar. Quem chega já foi convidado e
// só precisa escolher uma senha; o painel com "bem-vindo de volta" e três
// destaques seria conversa de venda no meio de um passo obrigatório.
//
// Sem painel, o molde centra o formulário na tela inteira e traz a marca acima
// dele — que continua sendo o único elemento dizendo onde a pessoa está.
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
    <AuthScreen
      brand={{ name: 'IA Studio', logo: <DSIcon name="spark" size="sm" /> }}
      title="Criar o seu acesso"
      subtitle="Você foi convidado. Escolha uma senha para entrar."
    >
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
        <Button type="submit" variant="primary" size="lg" loading={salvando} block>
          Criar meu acesso
        </Button>
      </form>
    </AuthScreen>
  );
}
