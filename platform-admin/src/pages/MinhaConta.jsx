import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PageHeader, Card, Badge, ProgressBar, CopyButton, CheckGroup, Checkbox,
  DSIcon, useToast,
} from '@studio-ux-ds/react';
import { getLicense } from '../services/account';
import { formatNumber, formatLimit, formatDate } from '../lib/format';

// Minha conta — plano, licença e quanto da cota já foi usado. Migrada pro DS na
// v0.10.16.
//
// Decisões de composição:
//
//  · **A barra de consumo usa o `ProgressBar` do DS com `tone`** (DS v1.2.37). O
//    legado desenhava a barra à mão e escolhia a cor com hex cravado (`#f59e0b` a
//    partir de 70%, `#ef4444` a partir de 90%) — cor fora do tema, que não
//    acompanha claro/escuro nem o accent escolhido pelo usuário.
//  · **Cota sem limite não tem barra.** O legado desenhava 4% em cinza para
//    representar "ilimitado", o que é uma barra que mente: 4% de nada. Sem teto,
//    o que informa é o número usado — a barra só existe quando há limite para
//    comparar.
//  · **Os recursos do plano usam `CheckGroup` + `Checkbox` desabilitado**, não
//    ícones de ✓/✗ à mão: é uma lista de "tem/não tem", e caixa marcada é o sinal
//    que o usuário já reconhece. Desabilitado porque é leitura — quem muda o
//    plano é o comercial, não esta tela.

const SITUACAO = {
  TRIAL:      { label: 'em teste',   tone: 'info' },
  ACTIVE:     { label: 'ativa',      tone: 'success' },
  RESTRICTED: { label: 'restrita',   tone: 'warning' },
  SUSPENDED:  { label: 'suspensa',   tone: 'danger' },
  EXPIRED:    { label: 'vencida',    tone: 'danger' },
  CANCELLED:  { label: 'cancelada',  tone: 'neutral' },
};

const MEDIDAS = {
  users:            'Pessoas com acesso',
  workspaces:       'Workspaces',
  agents:           'Assistentes',
  flows:            'Fluxos',
  executions:       'Execuções no mês',
  tokens:           'Tokens no mês',
  whatsapp_numbers: 'Números de WhatsApp',
  google_accounts:  'Contas Google',
  connections:      'Conexões',
};

const RECURSOS = {
  whatsapp:    'WhatsApp',
  email:       'E-mail',
  automation:  'Automação',
  studio:      'Studio',
  mcp:         'MCP',
  marketplace: 'Marketplace',
  api:         'API pública',
  white_label: 'Marca própria',
  rag:         'Bases de conhecimento',
  voice:       'Voz',
  analytics:   'Relatórios',
};

export default function MinhaConta() {
  const toast = useToast();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const data = await getLicense();
        if (vivo) setLicense(data?.license || data);
      } catch (err) {
        toast.error(err.message);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Minha conta" />
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
        </div>
      </div>
    );
  }

  const situacao = SITUACAO[license?.status] || { label: license?.status || '—', tone: 'neutral' };
  const plano = license?.plan?.name || license?.plan_name || license?.plan || '—';
  const chave = license?.key || license?.license_key || '';
  const limites = license?.limits || {};
  const uso = license?.usage || {};
  const recursos = license?.features || license?.plan?.features || [];
  const ligados = Array.isArray(recursos)
    ? recursos
    : Object.entries(recursos).filter(([, v]) => v).map(([k]) => k);

  const medidas = Object.keys(MEDIDAS).filter((k) => k in limites || k in uso);

  const validade = license?.status === 'TRIAL' && license?.trial_ends_at
    ? `O período de teste termina em ${formatDate(license.trial_ends_at)}.`
    : license?.expires_at
      ? `Vale até ${formatDate(license.expires_at)}.`
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Minha conta" subtitle="O plano da organização, o que ele libera e quanto já foi usado." />

      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span style={{ color: 'var(--su-action)' }}><DSIcon name="user" size="lg" /></span>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 12, margin: 0, color: 'var(--su-text-muted)' }}>Plano</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>{plano}</p>
            </div>
            <Badge tone={situacao.tone}>{situacao.label}</Badge>
          </div>

          {validade && (
            <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>{validade}</p>
          )}

          {chave && (
            <div className="space-y-1.5">
              <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
                Chave da licença
              </p>
              <div className="flex items-center gap-2">
                <code
                  style={{
                    flex: 1, minWidth: 0, fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12,
                    border: '1px solid var(--su-border-default)', borderRadius: 8, padding: '8px 12px',
                    color: 'var(--su-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {chave}
                </code>
                <CopyButton
                  value={chave}
                  label="Copiar"
                  variant="secondary"
                  size="md"
                  onCopied={(ok) => { if (!ok) toast.error('Não deu para copiar — selecione e copie à mão.'); }}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20 }} className="space-y-4">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            Quanto já foi usado
          </h2>
          {!medidas.length ? (
            <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-muted)' }}>
              O plano não declara medida de consumo.
            </p>
          ) : (
            <div className="space-y-4">
              {medidas.map((k) => {
                const usado = uso[k] ?? 0;
                const limite = limites[k];
                const semLimite = limite == null;
                const pct = semLimite ? 0 : Math.min(100, (usado / (limite || 1)) * 100);
                // O papel da cor é o aviso: perto do teto muda de tom.
                const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : undefined;
                return (
                  <div key={k} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>{MEDIDAS[k]}</p>
                      <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-muted)' }}>
                        {semLimite
                          ? `${formatNumber(usado)} · sem limite`
                          : `${formatNumber(usado)} de ${formatLimit(limite)}`}
                      </p>
                    </div>
                    {/* Sem teto não há barra: barra sem limite não compara nada. */}
                    {!semLimite && <ProgressBar value={pct} tone={tone} label={MEDIDAS[k]} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20 }} className="space-y-3">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--su-text-primary)' }}>
            O que este plano libera
          </h2>
          <CheckGroup columns={3} role="group">
            {Object.entries(RECURSOS).map(([k, label]) => (
              <Checkbox
                key={k}
                variant="card"
                label={label}
                checked={ligados.includes(k)}
                disabled
                readOnly
                meta={ligados.includes(k) ? 'incluído' : 'fora do plano'}
              />
            ))}
          </CheckGroup>
        </div>
      </Card>
    </div>
  );
}
