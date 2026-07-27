import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, Badge, Button, Banner, CopyButton, DSIcon, useToast } from '@studio-ux-ds/react';
import { getPublicPayment } from '../services/isp';

// Rota PÚBLICA `/pagar/:token` — 2ª via de boleto sem login. Migrada pro DS na
// v0.10.16.
//
// **É a tela mais exposta do sistema**: quem abre é o cliente final do provedor,
// muitas vezes no celular, quase sempre com pressa e às vezes sem internet boa.
// Três consequências no desenho:
//
//  · **Fora do AppShell e sem nada além do necessário** — não há menu, não há
//    sessão, e a página não pede nada de volta.
//  · **Copiar é a ação principal**, não secundária: quase todo mundo paga pelo
//    PIX copia-e-cola no aplicativo do banco. Por isso o `CopyButton` do DS, com
//    rótulo visível e o fallback de área de transferência — a versão anterior
//    engolia a falha em silêncio (`catch { }` vazio), o que num celular sem
//    permissão de clipboard significa um botão que não faz nada e não avisa.
//  · **"Vencido" é `Badge tone="danger"`** e não um pílula com `rgba(239,68,68)`
//    cravado: a cor do aviso passa a ser a mesma do resto do sistema, e funciona
//    no tema escuro do celular.

function comoData(iso) {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function comoDinheiro(v) {
  if (v == null || v === '') return '';
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `R$ ${v}`;
}

// Valor técnico + copiar, com o valor à vista: quem cola no banco quer conferir
// os primeiros dígitos antes de pagar.
function CampoParaCopiar({ label, value, semEspacos }) {
  const toast = useToast();
  const paraCopiar = semEspacos ? String(value).replace(/\s/g, '') : String(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--su-text-primary)' }}>{label}</span>
        <CopyButton
          value={paraCopiar}
          label="Copiar"
          variant="secondary"
          size="sm"
          onCopied={(ok) => {
            if (!ok) toast.error('Seu navegador não deixou copiar. Selecione o texto e copie à mão.');
          }}
        />
      </div>
      <code
        style={{
          display: 'block', fontFamily: 'var(--su-font-mono, monospace)', fontSize: 12,
          border: '1px solid var(--su-border-default)', borderRadius: 8, padding: 10,
          color: 'var(--su-text-secondary)', wordBreak: 'break-all',
        }}
      >
        {value}
      </code>
    </div>
  );
}

export default function PaginaPagamento() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await getPublicPayment(token);
        if (vivo) setDados(d);
      } catch (err) {
        if (vivo) setErro(err.message || 'Este link não vale mais.');
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  const boletos = Array.isArray(dados?.boletos) ? dados.boletos : [];

  return (
    <div
      className="flex flex-col items-center p-4"
      style={{ minHeight: '100dvh', background: 'var(--su-surface-base)' }}
    >
      <div style={{ width: '100%', maxWidth: 460, paddingTop: 24, paddingBottom: 24 }} className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <span style={{ color: 'var(--su-action)', marginBottom: 8 }}>
            <DSIcon name="file" size="lg" />
          </span>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>
            Seu boleto
          </h1>
          {dados?.customer_name && (
            <p style={{ fontSize: 14, margin: '4px 0 0', color: 'var(--su-text-secondary)' }}>{dados.customer_name}</p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--su-text-muted)' }} />
          </div>
        )}

        {!loading && erro && (
          <Card>
            <div style={{ padding: 20 }} className="space-y-3">
              <Banner tone="warning">{erro}</Banner>
              <p style={{ fontSize: 13, margin: 0, color: 'var(--su-text-secondary)' }}>
                Estes links valem por pouco tempo, por segurança. Peça um novo pelo WhatsApp do atendimento.
              </p>
            </div>
          </Card>
        )}

        {!loading && !erro && !boletos.length && (
          <Card>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 14, margin: 0, textAlign: 'center', color: 'var(--su-text-secondary)' }}>
                Nenhum boleto em aberto agora. Se você acabou de pagar, o sistema pode levar algumas horas para
                registrar.
              </p>
            </div>
          </Card>
        )}

        {!loading && !erro && boletos.map((b, i) => (
          <Card key={i}>
            <div style={{ padding: 20 }} className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--su-text-primary)' }}>
                    {comoDinheiro(b.valor_aberto || b.valor)}
                  </p>
                  <p style={{ fontSize: 13, margin: '2px 0 0', color: 'var(--su-text-muted)' }}>
                    Vence em {comoData(b.vencimento)}
                  </p>
                </div>
                {b.vencido && (
                  <Badge tone="danger">
                    {b.dias_em_atraso
                      ? `${b.dias_em_atraso} dia${b.dias_em_atraso > 1 ? 's' : ''} em atraso`
                      : 'em atraso'}
                  </Badge>
                )}
              </div>

              {b.pix_copia_cola && (
                <CampoParaCopiar label="PIX copia e cola" value={b.pix_copia_cola} />
              )}

              {b.linha_digitavel && (
                <CampoParaCopiar label="Código de barras" value={b.linha_digitavel} semEspacos />
              )}

              {b.link_boleto && (
                <Button
                  variant="primary"
                  block
                  iconRight="external-link"
                  onClick={() => window.open(b.link_boleto, '_blank', 'noopener,noreferrer')}
                >
                  Abrir o boleto ou pagar com QR Code
                </Button>
              )}
            </div>
          </Card>
        ))}

        {!loading && !erro && (
          <p style={{ fontSize: 12, margin: 0, textAlign: 'center', color: 'var(--su-text-muted)' }}>
            Este link é só seu e vale por pouco tempo. Não repasse para ninguém.
          </p>
        )}
      </div>
    </div>
  );
}
