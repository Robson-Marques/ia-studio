import React, { useEffect, useState } from 'react';
import { CreditCard, KeyRound, Copy, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@studio-ux-ds/react';
import { Badge } from '../components/ui/Table';
import { getLicense } from '../services/account';
import { formatNumber, formatLimit, formatDate } from '../lib/format';

const STATUS_BADGE = {
  TRIAL:      { label: 'Trial',     variant: 'blue' },
  ACTIVE:     { label: 'Ativa',     variant: 'green' },
  RESTRICTED: { label: 'Restrita',  variant: 'yellow' },
  SUSPENDED:  { label: 'Suspensa',  variant: 'red' },
  EXPIRED:    { label: 'Expirada',  variant: 'red' },
  CANCELLED:  { label: 'Cancelada', variant: 'gray' },
};

const METRIC_LABELS = {
  users:            'Usuários',
  workspaces:       'Workspaces',
  agents:           'Agentes',
  flows:            'Fluxos',
  executions:       'Execuções (mês)',
  tokens:           'Tokens (mês)',
  whatsapp_numbers: 'Números WhatsApp',
  google_accounts:  'Contas Google',
  connections:      'Conexões',
};

const FEATURE_LABELS = {
  whatsapp:    'WhatsApp',
  email:       'E-mail',
  automation:  'Automação',
  studio:      'Studio',
  mcp:         'MCP',
  marketplace: 'Marketplace',
  api:         'API Pública',
  white_label: 'White Label',
  rag:         'RAG (Bases de conhecimento)',
  voice:       'Voz',
  analytics:   'Analytics',
};

export default function MinhaConta() {
  const toast = useToast();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getLicense();
        if (alive) setLicense(data?.license || data);
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(license?.key || license?.license_key || '');
      toast.success('Chave copiada.');
    } catch {
      toast.error('Não foi possível copiar a chave.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
      </div>
    );
  }

  const statusInfo = STATUS_BADGE[license?.status] || { label: license?.status || '—', variant: 'gray' };
  const planName = license?.plan?.name || license?.plan_name || license?.plan || '—';
  const key = license?.key || license?.license_key || '';
  const limits = license?.limits || {};
  const usage  = license?.usage  || {};
  const features = license?.features || license?.plan?.features || [];
  const enabledFeatures = Array.isArray(features)
    ? features
    : Object.entries(features).filter(([, v]) => v).map(([k]) => k);

  // Metricas: uniao das chaves de limits + usage, na ordem conhecida.
  const metricKeys = Object.keys(METRIC_LABELS)
    .filter((k) => k in limits || k in usage);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>Minha Conta</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ap-text-4)' }}>
          Plano, licença e consumo da organização.
        </p>
      </div>

      {/* Plano + licenca */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand">
            <CreditCard size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ap-text-4)' }}>Plano atual</p>
            <p className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>{planName}</p>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>

        {(license?.trial_ends_at || license?.expires_at) && (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
            {license?.status === 'TRIAL' && license?.trial_ends_at
              ? `Trial termina em ${formatDate(license.trial_ends_at)}.`
              : license?.expires_at
                ? `Válida até ${formatDate(license.expires_at)}.`
                : null}
          </p>
        )}

        {key && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ap-text-5)' }}>
              Chave da licença
            </p>
            <div className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs truncate"
                style={{ backgroundColor: 'var(--ap-surface-3)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)' }}
              >
                <KeyRound size={13} className="shrink-0" style={{ color: 'var(--ap-text-4)' }} />
                <span className="truncate">{key}</span>
              </div>
              <button className="btn-secondary shrink-0" onClick={copyKey} title="Copiar chave">
                <Copy size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Consumo */}
      <div className="card p-5">
        <p className="text-sm font-bold mb-4" style={{ color: 'var(--ap-text-1)' }}>Consumo</p>
        {!metricKeys.length ? (
          <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>Sem métricas disponíveis.</p>
        ) : (
          <div className="space-y-4">
            {metricKeys.map((k) => {
              const used = usage[k] ?? 0;
              const limit = limits[k];
              const unlimited = limit == null;
              const pct = unlimited ? 0 : Math.min(100, (used / (limit || 1)) * 100);
              const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--ap-accent)';
              return (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>{METRIC_LABELS[k]}</p>
                    <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                      {formatNumber(used)} / {formatLimit(limit)}
                    </p>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--ap-surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: unlimited ? '4%' : `${pct}%`, backgroundColor: unlimited ? 'var(--ap-text-5)' : barColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recursos habilitados */}
      <div className="card p-5">
        <p className="text-sm font-bold mb-4" style={{ color: 'var(--ap-text-1)' }}>Recursos do plano</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(FEATURE_LABELS).map(([k, label]) => {
            const on = enabledFeatures.includes(k);
            return (
              <div
                key={k}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--ap-surface-2)',
                  border: '1px solid var(--ap-border-sub)',
                  color: on ? 'var(--ap-text-1)' : 'var(--ap-text-5)',
                }}
              >
                {on
                  ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  : <XCircle size={15} className="shrink-0" style={{ color: 'var(--ap-text-5)' }} />}
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
