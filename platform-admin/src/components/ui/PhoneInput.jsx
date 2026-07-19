// PhoneInput — telefone com seletor de país (bandeira + DDI) e busca.
// Porte do delivery-system, re-tematizado para as CSS vars --ap-* do painel.
// Guarda SEMPRE só dígitos COM DDI e SEM "+" (ex.: "5527999998888") — a mesma
// convenção do WhatsApp/back (normalizePhoneFromUser/FromWhatsApp).
//
// Props:
//   value:    string só-dígitos com DDI ("5527999998888") ou "" para vazio
//   onChange: (fullDigits: string) => void  — dígitos com DDI, sem "+"
//   disabled, error, placeholder, size ('sm'|'md'), id
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

// name = nome exibido; dial = DDI; mask = máscara do número LOCAL (sem DDI);
// maxDigits = máximo de dígitos do número local. BR no topo (padrão).
const COUNTRIES = [
  { code: 'BR', name: 'Brasil', dial: '+55', flag: '🇧🇷', mask: '(##) #####-####', maxDigits: 11 },
  { code: 'US', name: 'Estados Unidos', dial: '+1', flag: '🇺🇸', mask: '(###) ###-####', maxDigits: 10 },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹', mask: '### ### ###', maxDigits: 9 },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷', mask: '## ####-####', maxDigits: 10 },
  { code: 'UY', name: 'Uruguai', dial: '+598', flag: '🇺🇾', mask: '## ### ###', maxDigits: 8 },
  { code: 'PY', name: 'Paraguai', dial: '+595', flag: '🇵🇾', mask: '### ### ###', maxDigits: 9 },
  { code: 'CL', name: 'Chile', dial: '+56', flag: '🇨🇱', mask: '# #### ####', maxDigits: 9 },
  { code: 'CO', name: 'Colômbia', dial: '+57', flag: '🇨🇴', mask: '### ### ####', maxDigits: 10 },
  { code: 'MX', name: 'México', dial: '+52', flag: '🇲🇽', mask: '## #### ####', maxDigits: 10 },
  { code: 'PE', name: 'Peru', dial: '+51', flag: '🇵🇪', mask: '### ### ###', maxDigits: 9 },
  { code: 'GB', name: 'Reino Unido', dial: '+44', flag: '🇬🇧', mask: '#### ### ####', maxDigits: 11 },
  { code: 'DE', name: 'Alemanha', dial: '+49', flag: '🇩🇪', mask: '#### #######', maxDigits: 11 },
  { code: 'FR', name: 'França', dial: '+33', flag: '🇫🇷', mask: '# ## ## ## ##', maxDigits: 9 },
  { code: 'ES', name: 'Espanha', dial: '+34', flag: '🇪🇸', mask: '### ### ###', maxDigits: 9 },
  { code: 'IT', name: 'Itália', dial: '+39', flag: '🇮🇹', mask: '### ### ####', maxDigits: 10 },
  { code: 'JP', name: 'Japão', dial: '+81', flag: '🇯🇵', mask: '##-####-####', maxDigits: 10 },
  { code: 'BO', name: 'Bolívia', dial: '+591', flag: '🇧🇴', mask: '#### ####', maxDigits: 8 },
  { code: 'EC', name: 'Equador', dial: '+593', flag: '🇪🇨', mask: '## ### ####', maxDigits: 9 },
  { code: 'VE', name: 'Venezuela', dial: '+58', flag: '🇻🇪', mask: '### ### ####', maxDigits: 10 },
  { code: 'AO', name: 'Angola', dial: '+244', flag: '🇦🇴', mask: '### ### ###', maxDigits: 9 },
  { code: 'MZ', name: 'Moçambique', dial: '+258', flag: '🇲🇿', mask: '## ### ####', maxDigits: 9 },
];

function getCountryByCode(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];
}

/** Detecta o país a partir dos dígitos com DDI (ex.: "5521999..." → BR). */
function detectCountry(fullDigits) {
  if (!fullDigits) return { country: COUNTRIES[0], local: '' };
  for (const len of [3, 2, 1]) {
    const prefix = fullDigits.substring(0, len);
    const match = COUNTRIES.find((c) => c.dial === '+' + prefix);
    if (match) return { country: match, local: fullDigits.substring(len) };
  }
  return { country: COUNTRIES[0], local: fullDigits };
}

function applyMask(digits, mask) {
  let result = '';
  let di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === '#') result += digits[di++];
    else result += mask[i];
  }
  return result;
}

function maskToPlaceholder(mask) {
  return mask.replace(/#/g, '9');
}

export default function PhoneInput({
  value = '',
  onChange,
  placeholder,
  disabled,
  error,
  size = 'md',
  id,
}) {
  const detected = detectCountry((value ?? '').replace(/\D/g, ''));
  const [country, setCountry] = useState(detected.country);
  const [localDigits, setLocalDigits] = useState(detected.local);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const dropRef = useRef(null);
  const filterRef = useRef(null);

  // Sync externo → interno (troca de registro editado, reset do form).
  useEffect(() => {
    const digits = (value ?? '').replace(/\D/g, '');
    if (!digits) { setLocalDigits(''); return; }
    const det = detectCountry(digits);
    if (det.country.code !== country.code) setCountry(det.country);
    if (det.local !== localDigits) setLocalDigits(det.local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => filterRef.current?.focus(), 50);
  }, [open]);

  const emit = useCallback(
    (c, digits) => {
      if (!digits) { onChange?.(''); return; }
      const dialDigits = c.dial.replace(/\D/g, '');
      onChange?.(dialDigits + digits);
    },
    [onChange],
  );

  function handleLocalChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, country.maxDigits);
    setLocalDigits(raw);
    emit(country, raw);
  }

  function selectCountry(c) {
    setCountry(c);
    setOpen(false);
    setFilter('');
    const trimmed = localDigits.slice(0, c.maxDigits);
    setLocalDigits(trimmed);
    emit(c, trimmed);
  }

  const filtered = filter
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(filter.toLowerCase()) ||
          c.dial.includes(filter) ||
          c.code.toLowerCase().includes(filter.toLowerCase()),
      )
    : COUNTRIES;

  const displayValue = applyMask(localDigits, country.mask);
  const ph = placeholder || maskToPlaceholder(country.mask);
  const py = size === 'sm' ? 'py-1.5' : 'py-2';
  const textSz = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className="relative flex items-stretch rounded-lg border overflow-visible"
      ref={dropRef}
      style={{
        backgroundColor: 'var(--ap-surface)',
        borderColor: error ? 'var(--ap-danger, #ef4444)' : 'var(--ap-border)',
      }}
    >
      {/* Seletor de país */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2.5 ${py} border-r ${textSz} shrink-0 transition hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed`}
        style={{ borderColor: 'var(--ap-border)' }}
        aria-label={`País: ${country.name}`}
      >
        <span className="text-base leading-none">{country.flag}</span>
        <span className="font-mono text-xs" style={{ color: 'var(--ap-text-2)' }}>{country.dial}</span>
        <ChevronDown size={12} className="opacity-60" />
      </button>

      {/* Número local */}
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        value={displayValue}
        onChange={handleLocalChange}
        placeholder={ph}
        className={`flex-1 min-w-0 w-0 px-3 ${py} ${textSz} rounded-r-lg outline-none bg-transparent disabled:opacity-50`}
        style={{ color: 'var(--ap-text-1)' }}
      />

      {/* Dropdown de países */}
      {open && !disabled && (
        <div
          className="absolute left-0 top-full mt-1 w-64 rounded-lg shadow-xl border z-[100] max-h-60 overflow-hidden flex flex-col"
          style={{ backgroundColor: 'var(--ap-surface-2, var(--ap-surface))', borderColor: 'var(--ap-border)' }}
        >
          <div className="p-2 border-b" style={{ borderColor: 'var(--ap-border)' }}>
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar país..."
              className="input w-full text-sm"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => selectCountry(c)}
                className={
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition hover:bg-black/5 dark:hover:bg-white/5 ' +
                  (c.code === country.code ? 'bg-black/5 dark:bg-white/5' : '')
                }
                style={{ color: 'var(--ap-text-1)' }}
              >
                <span className="text-base">{c.flag}</span>
                <span className="w-10 text-right font-mono text-xs" style={{ color: 'var(--ap-text-3)' }}>{c.dial}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-sm text-center" style={{ color: 'var(--ap-text-4)' }}>
                Nenhum país encontrado
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { COUNTRIES, detectCountry, applyMask, getCountryByCode };
