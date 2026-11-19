import React, { useEffect, useState } from 'react';
import { DashboardScreen, Card, Badge, DSIcon, useToast } from '@studio-ux-ds/react';
import api, { extractErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../lib/format';

// Painel da única instalação. As métricas descrevem a operação local, sem
// plano, limite comercial, organização ou workspace.
export default function Dashboard() {
  const toast = useToast();
  const { me } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get('/dashboards/summary');
        if (alive) setSummary(data || {});
      } catch (err) {
        if (alive) toast.error(extractErrorMessage(err, 'Erro ao carregar o resumo da instalação'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toast]);

  const stats = [
    { label: 'Execuções', value: formatNumber(summary?.executions?.total ?? 0), sub: `${formatNumber(summary?.executions?.errors ?? 0)} com erro`, icon: <DSIcon name="play" />, hue: 'indigo' },
    { label: 'Mensagens enviadas', value: formatNumber(summary?.whatsapp_messages ?? 0), sub: 'WhatsApp', icon: <DSIcon name="message" />, hue: 'teal' },
    { label: 'E-mails enviados', value: formatNumber(summary?.emails ?? 0), sub: 'Automação', icon: <DSIcon name="mail" />, hue: 'blue' },
    { label: 'Conexões ativas', value: formatNumber(summary?.connections?.active ?? 0), sub: `${formatNumber(summary?.connections?.error ?? 0)} com erro`, icon: <DSIcon name="plug" />, hue: 'violet' },
  ];

  return (
    <DashboardScreen title="IA Studio" subtitle="Resumo da operação desta instalação." stats={stats} loading={loading} statsCount={4}>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="flex-1 min-w-0"><p className="font-semibold m-0">Instância dedicada</p><p className="text-sm m-0" style={{ color: 'var(--su-text-muted)' }}>Dados, integrações e automações pertencem somente a esta instalação.</p></div>
          <Badge tone="success">operacional</Badge>
        </div>
      </Card>
      {me?.user?.name && <p className="text-sm m-0" style={{ color: 'var(--su-text-muted)' }}>Sessão local de {me.user.name}.</p>}
    </DashboardScreen>
  );
}
