import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export function FormField({ label, error, required, children, hint, className }) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && (
        <label className="block text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="text-[10px]" style={{ color: 'var(--ap-text-4)' }}>{hint}</p>
      )}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

export function TextInput({ className, onFocus, ...props }) {
  const handleFocus = (e) => {
    if (props.type === 'number') e.target.select();
    onFocus?.(e);
  };
  return <input {...props} onFocus={handleFocus} className={clsx('input', className)} />;
}

// Input numerico com STATE LOCAL de digitacao (evita loop "0" que nao apaga).
// `allowEmpty=true` propaga null quando vazio — usado pra limites "ilimitado".
export function NumberInput({ value, onChange, min, max, step = 'any', allowEmpty = false, className, ...props }) {
  const numericValue = value == null ? '' : String(value);
  const [draft, setDraft] = useState(numericValue);
  const lastExternal = useRef(numericValue);

  useEffect(() => {
    const ext = value == null ? '' : String(value);
    if (ext === lastExternal.current) return;
    lastExternal.current = ext;
    const draftNum = draft === '' ? null : Number(draft);
    if (draftNum === value) return;
    setDraft(ext);
  }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e) {
    const raw = e.target.value;
    setDraft(raw);
    if (raw === '' || raw === '-' || raw === '.' || raw === ',') {
      onChange?.(allowEmpty ? null : 0);
      return;
    }
    const cleaned = raw.replace(',', '.');
    const n = Number(cleaned);
    if (Number.isNaN(n)) return;
    if (min !== undefined && n < Number(min)) return;
    if (max !== undefined && n > Number(max)) return;
    onChange?.(n);
  }

  function handleBlur() {
    if (draft === '' || draft === '-' || draft === '.' || draft === ',') {
      setDraft(allowEmpty ? '' : '0');
      return;
    }
    const n = Number(draft.replace(',', '.'));
    if (!Number.isNaN(n)) setDraft(String(n));
  }

  // type="text" + inputMode evita bugs do type="number" nativo.
  const isDecimal = step === 'any' || (typeof step === 'number' && step < 1) || (typeof step === 'string' && step.includes('.'));
  return (
    <input
      {...props}
      type="text"
      inputMode={isDecimal ? 'decimal' : 'numeric'}
      pattern={isDecimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      min={min}
      max={max}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={(e) => e.target.select()}
      className={clsx('input', className)}
    />
  );
}

export function Select({ className, children, ...props }) {
  return <select {...props} className={clsx('select', className)}>{children}</select>;
}

export function Textarea({ className, ...props }) {
  return <textarea {...props} className={clsx('input min-h-[80px]', className)} />;
}
