import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Copy, Check, ExternalLink, Receipt, AlertTriangle } from 'lucide-react';
import { getPublicPayment } from '../services/isp';

// Rota PÚBLICA /pagar/:token (frente 5) — 2ª via de boleto sem login. Consome o
// endpoint público tokenizado; o link expira sozinho. Standalone (fora do Layout).
function fmtData(iso) {
  if (typeof iso !== 'string') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function fmtValor(v) {
  if (v == null || v === '') return '';
  const s = String(v).replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `R$ ${v}`;
}

function CopyField({ label, value, strip }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(strip ? String(value).replace(/\s/g, '') : String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível — o usuário copia manualmente */ }
  }
  return (
    <div className="space-y-1">
      <span className="text-xs" style={{ color: 'var(--ap-text-4)' }}>{label}</span>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 text-xs p-2 rounded break-all"
          style={{ backgroundColor: 'var(--ap-bg-page)', border: '1px solid var(--ap-border)', color: 'var(--ap-text-1)' }}>
          {value}
        </code>
        <button type="button" onClick={copy} title={`Copiar ${label}`}
          className="btn-secondary px-3 min-h-[44px] shrink-0">
          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function PaginaPagamento() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getPublicPayment(token);
        if (alive) setDados(d);
      } catch (err) {
        if (alive) setErro(err.message || 'Link inválido ou expirado.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const boletos = Array.isArray(dados?.boletos) ? dados.boletos : [];

  return (
    <div className="min-h-[100dvh] flex flex-col items-center p-4" style={{ backgroundColor: 'var(--ap-bg-page)' }}>
      <div className="w-full max-w-md py-6 space-y-4">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand/15 flex items-center justify-center mb-3">
            <Receipt size={28} className="text-brand" />
          </div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>2ª via de boleto</h1>
          {dados?.customer_name && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--ap-text-3)' }}>{dados.customer_name}</p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ap-text-4)' }} />
          </div>
        )}

        {!loading && erro && (
          <div className="card p-6 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={28} className="text-amber-500" />
            <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>{erro}</p>
            <p className="text-xs" style={{ color: 'var(--ap-text-4)' }}>
              Peça um novo link pelo atendimento no WhatsApp.
            </p>
          </div>
        )}

        {!loading && !erro && boletos.length === 0 && (
          <div className="card p-6 text-center">
            <p className="text-sm" style={{ color: 'var(--ap-text-2)' }}>Nenhum boleto em aberto no momento.</p>
          </div>
        )}

        {!loading && !erro && boletos.map((b, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-bold" style={{ color: 'var(--ap-text-1)' }}>{fmtValor(b.valor_aberto || b.valor)}</div>
                <div className="text-xs" style={{ color: 'var(--ap-text-4)' }}>Vencimento: {fmtData(b.vencimento)}</div>
              </div>
              {b.vencido && (
                <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                  {b.dias_em_atraso ? `Vencido há ${b.dias_em_atraso} dia${b.dias_em_atraso > 1 ? 's' : ''}` : 'Vencido'}
                </span>
              )}
            </div>

            {b.pix_copia_cola && (
              <div className="rounded-lg p-2" style={{ backgroundColor: 'rgba(50,120,110,0.08)' }}>
                <CopyField label="PIX copia e cola" value={b.pix_copia_cola} />
              </div>
            )}

            {b.linha_digitavel && <CopyField label="Linha digitável" value={b.linha_digitavel} strip />}

            {b.link_boleto && (
              <a href={b.link_boleto} target="_blank" rel="noopener noreferrer"
                className="btn-primary w-full justify-center min-h-[44px]">
                <ExternalLink size={16} /> Abrir boleto ou pagar com QR Code
              </a>
            )}
          </div>
        ))}

        {!loading && !erro && (
          <p className="text-xs text-center" style={{ color: 'var(--ap-text-4)' }}>
            Este link é temporário e expira automaticamente. Não compartilhe.
          </p>
        )}
      </div>
    </div>
  );
}
