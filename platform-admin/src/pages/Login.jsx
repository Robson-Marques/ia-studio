import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AuthScreen, AuthLink, Field, Input, Button, Checkbox, DSIcon, useToast } from '@studio-ux-ds/react';
import { useAuth } from '../context/AuthContext';

// Login — instancia o **molde de acesso do DS** (`AuthScreen`, DS v1.2.40), que é
// a materialização em React do padrão que já existia em `examples/login.html`.
//
// Antes daqui a tela era um cartão centralizado escrito à mão: sem painel de
// marca, sem "esqueci a senha", sem "manter conectado". Não foi decisão de
// desenho — foi eu não ter procurado o molde. Ele estava especificado
// (`STUDIO_UX_TEMPLATES` §2) e no gerador HTML, mas não existia em React, então
// nada me obrigou a encontrá-lo.
//
// O que o produto decide (e o molde não impõe): quais campos, o que dizer no
// painel, e **não ter entrada por Google/Microsoft** — o IA Studio autentica por
// e-mail e senha local, então o divisor "ou continue com" do exemplo não
// se aplica aqui. O molde não obriga: aquilo é conteúdo, isto é arranjo.
export default function Login() {
  const toast = useToast();
  const { login, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [manterConectado, setManterConectado] = useState(true);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const marcaNome = 'IA Studio';

  async function entrar(e) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!senha) { toast.error('Informe a senha.'); return; }
    try {
      await login(email.trim(), senha);
      navigate('/', { replace: true });
    } catch (err) {
      // Genérica de propósito: dizer "este e-mail não existe" conta a um estranho
      // quais endereços têm conta aqui.
      toast.error(err.message || 'E-mail ou senha não conferem.');
    }
  }

  return (
    <AuthScreen
      brand={{
        name: marcaNome,
        logo: <DSIcon name="spark" size="sm" />,
      }}
      welcome="Bem-vindo de volta."
      pitch="Assistentes, automações e atendimento num só lugar. Entre para continuar de onde parou."
      features={[
        { icon: 'bot', label: 'Assistentes que atendem sozinhos, com aprovação quando precisa' },
        { icon: 'shield', label: 'Acesso por perfil e trilha de auditoria' },
        { icon: 'phone', label: 'Funciona no computador e no celular' },
      ]}
      footer={`© ${new Date().getFullYear()} ${marcaNome} · Todos os direitos reservados`}
      title="Entrar na sua conta"
      subtitle="Use o e-mail cadastrado nesta instalação."
    >
      <form onSubmit={entrar} className="space-y-4">
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            autoComplete="username"
            autoFocus
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          {/* Ainda não há fluxo de recuperação por e-mail: quem administra a
              instalação redefine a senha em Pessoas. O link diz isso em vez de
              prometer um e-mail que não vai chegar. */}
          <AuthLink
            href="#"
            onClick={(e) => {
              e.preventDefault();
              toast.info('Peça a quem administra a instalação para redefinir sua senha em Pessoas e convites.');
            }}
          >
            Esqueci a senha?
          </AuthLink>
        </Field>
        <Checkbox
          label="Manter conectado neste dispositivo"
          checked={manterConectado}
          onChange={(e) => setManterConectado(e.target.checked)}
        />
        <Button type="submit" variant="primary" size="lg" loading={loading} block>
          Entrar
        </Button>
      </form>
    </AuthScreen>
  );
}
