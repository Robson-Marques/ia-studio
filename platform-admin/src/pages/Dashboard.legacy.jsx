// LEGADO (2026-07-24). Versão anterior do Dashboard preservada para rollback:
// se PageHeader/StatCard do DS causarem regressão, basta trocar o import em
// App.jsx (Dashboard → Dashboard.legacy). Este arquivo NÃO é referenciado
// enquanto o novo estiver ativo.
import React, { useEffect, useState } from 'react';
import { Users, Boxes, PlayCircle, Cpu, Loader2, CreditCard } from 'lucide-react';
import { useToast } from '@studio-ux-ds/react';
import StatCard from '../components/ui/StatCard';
import { Badge } from '../components/ui/Table';
import { getLicense } from '../services/account';
import { useAuth } from '../context/AuthContext';
import { formatNumber, formatLimit, formatDate } from '../lib/format';

const STATUS_BADGE = {
  TRIAL:      { label: 'Trial',      variant: 'blue' },
  ACTIVE:     { label: 'Ativa',      variant: 'green' },
  RESTRICTED: { label: 'Restrita',   variant: 'yellow' },
  SUSPENDED:  { label: 'Suspensa',   variant: 'red' },
  EXPIRED:    { label: 'Expirada',   variant: 'red' },
  CANCELLED:  { label: 'Cancelada',  variant: 'gray' },
};

export default function DashboardLegacy() {
  const toast = useToast();
  const { me } = useAuth();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getLicense();
        if (alive) setLicense(data?.license || data);
      } catch (err) {
        toast.error(err.message || 'Erro ao carregar a licença');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
      </div>
    );
  }

  const usage  = license?.usage  || {};
  const limits = license?.limits || {};
  const planName = license?.plan?.name || license?.plan_name || license?.plan || '—';
  const statusInfo = STATUS_BADGE[license?.status] || { label: license?.status || '—', variant: 'gray' };
  const workspacesCount = usage.workspaces ?? (me?.workspaces?.length || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>
          {me?.organization?.name || 'Dashboard'}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Visão geral da sua conta no mês corrente.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Usuários"       value={formatNumber(usage.users ?? 0)}      sub={`Limite: ${formatLimit(limits.users)}`}      icon={Users}     color="brand"  />
        <StatCard label="Workspaces"     value={formatNumber(workspacesCount)}       sub={`Limite: ${formatLimit(limits.workspaces)}`} icon={Boxes}     color="blue"   />
        <StatCard label="Execuções no mês" value={formatNumber(usage.executions ?? 0)} sub={`Limite: ${formatLimit(limits.executions)}`} icon={PlayCircle} color="green"  />
        <StatCard label="Consumo de IA no mês" value={formatNumber(usage.tokens ?? 0)} sub={`Limite: ${formatLimit(limits.tokens)}`}    icon={Cpu}       color="purple" />
      </div>
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand"><CreditCard size={20} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ap-text-4)' }}>Plano atual</p>
            <p className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>{planName}</p>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        {(license?.trial_ends_at || license?.expires_at) && (
          <p className="text-xs mt-3" style={{ color: 'var(--ap-text-4)' }}>
            {license?.status === 'TRIAL' && license?.trial_ends_at
              ? `Trial termina em ${formatDate(license.trial_ends_at)}.`
              : license?.expires_at
                ? `Válida até ${formatDate(license.expires_at)}.`
                : null}
          </p>
        )}
      </div>
    </div>
  );
}
