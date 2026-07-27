import React, { useEffect, useState } from 'react';
import { PageHeader, StatCard, Card, Badge, DSIcon, useToast, Spinner } from '@studio-ux-ds/react';
import { getLicense } from '../services/account';
import { useAuth } from '../context/AuthContext';
import { formatNumber, formatLimit, formatDate } from '../lib/format';

// Dashboard — primeira tela após login. Migrado para o padrão visual do
// Studio UX (passo 3 da expansão de adoção, 2026-07-24): PageHeader + StatCard
// + Card do DS. Só a casca da tela mudou — dados e lógica seguem os mesmos da
// versão anterior (que está no histórico do git).

// StatCard do DS aceita `tone` = neutral | info | success | warning | danger.
// Mapeamento das 4 métricas do legado (que usavam `color` = brand/blue/green/purple):
//   Usuários      → info      (era brand/indigo)
//   Workspaces    → info      (era blue)
//   Execuções     → success   (era green)
//   Consumo de IA → neutral   (era purple — sem equivalente exato; neutro é sóbrio)
const STATUS_TO_DS = {
  TRIAL:      { label: 'Trial',      status: 'info' },
  ACTIVE:     { label: 'Ativa',      status: 'success' },
  RESTRICTED: { label: 'Restrita',   status: 'warning' },
  SUSPENDED:  { label: 'Suspensa',   status: 'danger' },
  EXPIRED:    { label: 'Expirada',   status: 'danger' },
  CANCELLED:  { label: 'Cancelada',  status: 'default' },
};

export default function Dashboard() {
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
        <Spinner size="lg" />
      </div>
    );
  }

  const usage  = license?.usage  || {};
  const limits = license?.limits || {};
  const planName = license?.plan?.name || license?.plan_name || license?.plan || '—';
  const statusInfo = STATUS_TO_DS[license?.status] || { label: license?.status || '—', status: 'default' };
  const workspacesCount = usage.workspaces ?? (me?.workspaces?.length || 0);

  const trialOrExpiryText = license?.status === 'TRIAL' && license?.trial_ends_at
    ? `Trial termina em ${formatDate(license.trial_ends_at)}.`
    : license?.expires_at
      ? `Válida até ${formatDate(license.expires_at)}.`
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={me?.organization?.name || 'Dashboard'}
        subtitle="Visão geral da sua conta no mês corrente."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* `hue` = matiz por ASSUNTO (DS v1.2.29, onde o `tone` semântico saiu do
            StatCard). A cor não diz "bom/ruim" — diz de que domínio o número é, e
            é **estável**: consumo de IA é sempre roxo, aqui e em Custos de IA;
            execuções é sempre verde-água, aqui e no console. É isso que faz o olho
            reencontrar o assunto entre telas.
            `sub` (não `delta`) porque "Limite: 5" é legenda, não variação — o
            `delta` é colorido por direção e pintava a legenda de verde. */}
        <StatCard
          label="Usuários"
          value={formatNumber(usage.users ?? 0)}
          sub={`Limite: ${formatLimit(limits.users)}`}
          icon={<DSIcon name="users" />}
          hue="violet"
        />
        <StatCard
          label="Workspaces"
          value={formatNumber(workspacesCount)}
          sub={`Limite: ${formatLimit(limits.workspaces)}`}
          icon={<DSIcon name="home" />}
          hue="blue"
        />
        <StatCard
          label="Execuções no mês"
          value={formatNumber(usage.executions ?? 0)}
          sub={`Limite: ${formatLimit(limits.executions)}`}
          icon={<DSIcon name="play" />}
          hue="teal"
        />
        <StatCard
          label="Consumo de IA no mês"
          value={formatNumber(usage.tokens ?? 0)}
          sub={`Limite: ${formatLimit(limits.tokens)}`}
          icon={<DSIcon name="chart-bar" />}
          hue="indigo"
        />
      </div>

      <Card>
        <div style={{ padding: 20 }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--su-text-muted)' }}>
                Plano atual
              </p>
              <p className="text-lg font-bold" style={{ color: 'var(--su-text-primary)' }}>{planName}</p>
            </div>
            <Badge tone={statusInfo.status}>{statusInfo.label}</Badge>
          </div>
          {trialOrExpiryText && (
            <p className="text-xs mt-3" style={{ color: 'var(--su-text-muted)' }}>{trialOrExpiryText}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
