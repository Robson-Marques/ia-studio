import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

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

// Gate de rota por permissao. Sem a perm → volta pra raiz (item da sidebar
// tambem some; isto e so o cinto de seguranca do deep-link).
// `perm` aceita string OU array (logica OR — ex.: abas do WhatsApp).
export function PermissionRoute({ perm, children }) {
  const { can } = usePermissions();
  const perms = Array.isArray(perm) ? perm : perm ? [perm] : [];
  if (perms.length > 0 && !perms.some((p) => can(p))) return <Navigate to="/" replace />;
  return children;
}
