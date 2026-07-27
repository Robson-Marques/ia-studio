import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Card, Field, Input, Button, DSIcon, useToast } from '@studio-ux-ds/react';
import { useAuth } from '../context/AuthContext';

// Login — a primeira tela, e a única que existe antes de haver sessão. Migrada
// pro DS na v0.10.16.
//
// Fica **fora do AppShell** de propósito (não há menu nem usuário para mostrar),
// então a centralização e o fundo são desta tela. O que vem do DS é o conteúdo:
// `Card`, `Field`, `Input`, `Button` — inclusive o `loading`, que aqui importa
// mais que em qualquer outro lugar: sem ele, quem clica duas vezes manda duas
// tentativas de login e pode acionar bloqueio por tentativa repetida.
export default function Login() {
  const toast = useToast();
  const { login, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function entrar(e) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!senha) { toast.error('Informe a senha.'); return; }
    try {
      await login(email.trim(), senha);
      navigate('/', { replace: true });
    } catch (err) {
      // Mensagem propositalmente genérica: dizer "este e-mail não existe"
      // contaria a um estranho quais endereços têm conta aqui.
      toast.error(err.message || 'E-mail ou senha não conferem.');
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
            <div className="flex flex-col items-center" style={{ marginBottom: 28 }}>
              <span style={{ color: 'var(--su-action)', marginBottom: 8 }}>
                <DSIcon name="spark" size="lg" />
              </span>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>IA Studio</h1>
              <p style={{ fontSize: 13, margin: '4px 0 0', color: 'var(--su-text-muted)' }}>Entre para continuar</p>
            </div>

            <form onSubmit={entrar} className="space-y-4">
              <Field label="E-mail">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  autoComplete="email"
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
              </Field>
              {/* `type="submit"` para o Enter no campo funcionar — o `Button` do
                  DS repassa os atributos nativos. `block` é do DS desde a v1.2.37. */}
              <Button type="submit" variant="primary" loading={loading} block>
                Entrar
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
