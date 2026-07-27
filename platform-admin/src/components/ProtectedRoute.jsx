import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import Aviso from '../pages/Aviso';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, checking } = useAuth();

  if (checking) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

// Gate de rota por permissão. O item da sidebar já some para quem não tem a
// perm; isto é o cinto de segurança do link direto — alguém colando um endereço
// que um colega com mais acesso mandou.
//
// **Antes redirecionava calado para a raiz** (`<Navigate to="/" />`): a pessoa
// clicava no link e caía no Dashboard sem nenhuma explicação, o que parece
// sistema travado. Agora diz o que aconteceu e o que fazer.
//
// `perm` aceita string OU array (lógica OR — ex.: as abas do WhatsApp).
export function PermissionRoute({ perm, children }) {
  const { can } = usePermissions();
  const perms = Array.isArray(perm) ? perm : perm ? [perm] : [];
  if (perms.length > 0 && !perms.some((p) => can(p))) return <Aviso motivo="sem-permissao" />;
  return children;
}
