import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  Button, Badge, StatCard, Card, Tabs, DataTable,
  Field, Input, Select, Switch, SegmentedControl,
} from '@studio-ux-ds/react';

// PILOTO DE ADOÇÃO — consome os pacotes publicados @studio-ux-ds/* (GitLab da Nivoo)
// dentro do app real do IA Studio. Rota isolada: NÃO toca em nenhuma tela existente.
// O tema do Studio UX é escopado a esta página via data-theme, sincronizado com o
// toggle do IA Studio (que usa a classe .dark). Nada vaza para o resto do painel.

// Garante as fontes/ícones que o Studio UX usa (Inter + Tabler), sem alterar o index.html.
function ensureAssets() {
  const links = [
    ['su-inter', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'],
    ['su-tabler', 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css'],
  ];
  for (const [id, href] of links) {
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    }
  }
}

export default function StudioUxDemo() {
  const { isDark } = useTheme();
  const [tab, setTab] = useState('componentes');
  const [range, setRange] = useState('30d');
  const [auto, setAuto] = useState(true);
  useEffect(() => { ensureAssets(); }, []);

  const rows = useMemo(() => ([
    { id: 1, cliente: 'Marina Alves', canal: 'WhatsApp', valor: 'R$ 240', status: 'success', rotulo: 'Pago' },
    { id: 2, cliente: 'Diego Prado', canal: 'App', valor: 'R$ 96', status: 'info', rotulo: 'Em preparo' },
    { id: 3, cliente: 'Bianca Ferraz', canal: 'Balcão', valor: 'R$ 180', status: 'danger', rotulo: 'Vencida' },
    { id: 4, cliente: 'Rafael Souza', canal: 'WhatsApp', valor: 'R$ 320', status: 'warning', rotulo: 'Pendente' },
  ]), []);

  const columns = [
    { key: 'cliente', header: 'Cliente' },
    { key: 'canal', header: 'Canal' },
    { key: 'valor', header: 'Valor', align: 'right' },
    { key: 'rotulo', header: 'Status', render: (r) => <Badge tone={r.status}>{r.rotulo}</Badge> },
  ];

  const TABS = [
    { id: 'componentes', label: 'Componentes' },
    { id: 'formulario', label: 'Formulário' },
    { id: 'dados', label: 'Dados' },
  ];

  return (
    <div className="su" data-theme={isDark ? 'dark' : 'light'} style={{ background: 'var(--su-surface-base)', color: 'var(--su-text-primary)', minHeight: '100%', margin: '-1rem', padding: '1.5rem', borderRadius: 12 }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: 'var(--su-action)', background: 'var(--su-action-tint)', padding: '3px 10px', borderRadius: 999 }}>
            <i className="ti ti-package" /> Piloto de adoção · @studio-ux-ds
          </div>
          <h1 style={{ fontSize: 'var(--su-text-h1)', fontWeight: 600, margin: '10px 0 4px' }}>Studio UX dentro do IA Studio</h1>
          <p style={{ color: 'var(--su-text-secondary)', margin: 0, fontSize: 'var(--su-text-body)' }}>
            Esta tela consome os pacotes publicados no GitLab da Nivoo (tokens + componentes + adapter React).
            É uma rota isolada — nenhuma tela existente foi tocada. O tema segue o toggle do IA Studio.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Receita do mês" value="R$ 148.230" delta="8,4%" deltaType="up" />
          <StatCard label="Pedidos" value="1.284" delta="3,1%" deltaType="up" />
          <StatCard label="Ticket médio" value="R$ 115,44" delta="5,2%" deltaType="up" />
          <StatCard label="Cancelamentos" value="2,3%" delta="0,4%" deltaType="down" />
        </section>

        <Tabs items={TABS} value={tab} onChange={setTab} />

        {tab === 'componentes' && (
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="primary" icon="plus">Nova fatura</Button>
                <Button variant="secondary" icon="download">Exportar</Button>
                <Button variant="ghost">Cancelar</Button>
                <Button variant="danger" icon="trash">Excluir</Button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Badge tone="success">Ativo</Badge>
                <Badge tone="warning">Pendente</Badge>
                <Badge tone="danger">Vencido</Badge>
                <Badge tone="info">Novo</Badge>
                <Badge tone="neutral">Rascunho</Badge>
              </div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <SegmentedControl items={[{ id: '7d', label: '7 dias' }, { id: '30d', label: '30 dias' }, { id: 'ano', label: 'Ano' }]} value={range} onChange={setRange} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Switch checked={auto} onChange={setAuto} aria-label="Automatismo" /> Envio automático
                </label>
              </div>
            </div>
          </Card>
        )}

        {tab === 'formulario' && (
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nome do cliente"><Input placeholder="Ex.: Marina Alves" /></Field>
              <Field label="E-mail"><Input type="email" placeholder="voce@empresa.com" /></Field>
              <Field label="Canal"><Select><option>WhatsApp</option><option>App</option><option>Balcão</option></Select></Field>
              <Field label="Valor" hint="Somente números"><Input inputMode="numeric" placeholder="0,00" /></Field>
            </div>
          </Card>
        )}

        {tab === 'dados' && (
          <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} />
        )}
      </div>
    </div>
  );
}
