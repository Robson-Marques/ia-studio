import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Phone, RefreshCw, Signal, Star } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import { Badge } from '../../components/ui/Table';
import { useToast } from '@studio-ux-ds/react';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime } from '../../lib/format';
import { listNumbers, syncNumber } from '../../services/whatsapp';
import { MESSAGING_LIMIT_LABEL, QUALITY, formatPhone } from './whatsapp.constants';

const STATUS_LABEL = {
  ACTIVE: { label: 'Ativa', variant: 'green' },
  DISABLED: { label: 'Desativada', variant: 'gray' },
  MAINTENANCE: { label: 'Manutenção', variant: 'yellow' },
  TOKEN_EXPIRED: { label: 'Token expirado', variant: 'red' },
  ERROR: { label: 'Erro', variant: 'red' },
  RECONNECTING: { label: 'Reconectando', variant: 'yellow' },
  SYNCING: { label: 'Sincronizando', variant: 'blue' },
  PENDING_AUTH: { label: 'Aguardando autenticação', variant: 'yellow' },
};

// Números WhatsApp — painel das conexões whatsapp-meta: qualidade, limite,
// status, health e sync. Nova conexão = Connection Wizard (Integrações).
export default function Numeros() {
  const toast = useToast();
  const { can } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listNumbers());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSync(n) {
    setSyncing(n.id);
    try {
      await syncNumber(n.id);
      toast.success('Número sincronizado com a Meta.');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold flex-1" style={{ color: 'var(--ap-text-1)' }}>Números WhatsApp</h2>
        {can('integrations.connections.write') && (
          <Link to="/integracoes/conexoes" className="btn-primary inline-flex items-center gap-1.5">
            <Phone size={14} /> Conectar número (wizard)
          </Link>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 size={18} className="animate-spin inline" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="Nenhum número conectado"
          description="Conecte um número pela conexão 'WhatsApp (Meta Cloud API)' em Integrações → Conexões (modo manual até a aprovação do App Meta pro Embedded Signup)."
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((n) => {
            const st = STATUS_LABEL[n.status] || STATUS_LABEL.PENDING_AUTH;
            const q = QUALITY[n.quality_rating] || QUALITY.UNKNOWN;
            return (
              <div key={n.id} className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{n.name}</p>
                    <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
                      {n.display_name || '—'} · {n.phone ? formatPhone(n.phone) : 'número não sincronizado'}
                    </p>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Star size={13} style={{ color: q.color }} />
                    <span style={{ color: 'var(--ap-text-2)' }}>Qualidade: <b style={{ color: q.color }}>{q.label}</b></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Signal size={13} style={{ color: 'var(--ap-text-4)' }} />
                    <span style={{ color: 'var(--ap-text-2)' }}>
                      {MESSAGING_LIMIT_LABEL[n.messaging_limit] || 'Limite desconhecido'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--ap-text-3)' }}>Templates: {n.templates_count ?? 0}</div>
                  <div style={{ color: 'var(--ap-text-3)' }}>
                    Health: {n.last_health_ok === null || n.last_health_ok === undefined ? '—' : n.last_health_ok ? 'OK' : 'Falhou'}
                  </div>
                  <div className="col-span-2" style={{ color: 'var(--ap-text-4)' }}>
                    Última sync: {n.last_sync_at ? formatDateTime(n.last_sync_at) : 'nunca'} (automática a cada 10 min)
                  </div>
                  {(n.department || n.is_default || (n.tags || []).length > 0) && (
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {n.is_default && <Badge variant="blue">Padrão</Badge>}
                      {n.department && <Badge variant="gray">{n.department}</Badge>}
                      {(n.tags || []).map((t) => <Badge key={t} variant="gray">{t}</Badge>)}
                    </div>
                  )}
                  {n.last_sync_error && (
                    <p className="col-span-2 text-red-400">{n.last_sync_error}</p>
                  )}
                  {n.status_detail && !n.last_sync_error && (
                    <p className="col-span-2" style={{ color: 'var(--ap-text-4)' }}>{n.status_detail}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title="Consulta a Meta agora (status, qualidade, limite, templates)"
                    className="btn-secondary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
                    style={{ minHeight: 36 }}
                    disabled={syncing === n.id || n.status !== 'ACTIVE'}
                    onClick={() => handleSync(n)}
                  >
                    {syncing === n.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Sincronizar agora
                  </button>
                  {can('integrations.connections.read') && (
                    <Link to="/integracoes/conexoes" className="text-xs underline" style={{ color: 'var(--ap-text-3)' }}>
                      Gerenciar conexão
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
