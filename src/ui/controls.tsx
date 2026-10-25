import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function motionReduced(): boolean {
  return document.documentElement.dataset.reduced === 'true';
}

/** 数値の変化を短いアニメーションで見せる。動きを抑える設定では即座に切り替える */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (motionReduced() || !Number.isFinite(value) || !Number.isFinite(from.current)) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const dur = 260;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - (1 - k) ** 3;
      const v = a + (value - a) * e;
      from.current = v;
      setShown(k >= 1 ? value : v);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span className={className}>{format(shown)}</span>;
}

interface NumberFieldProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** スライダーの範囲（入力欄より狭くしてよい）。false でスライダーなし */
  slider?: { min: number; max: number; step: number } | false;
  color?: string;
  hint?: ReactNode;
  integer?: boolean;
  /** 入力欄の右に添える補足（計算式など） */
  aside?: ReactNode;
  compact?: boolean;
}

/**
 * スライダーと数値入力が連動する入力欄。
 * 範囲外・数値でない入力はその場でエラーを表示し、計算には反映しない。
 */
export function NumberField({ label, value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, unit, slider, color, hint, integer, aside, compact }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => toText(value));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(toText(value));
      setError(null);
    }
  }, [value]);

  const commitText = (t: string) => {
    setText(t);
    const normalized = t.replace(/[０-９．－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s]/g, '').replace('−', '-');
    if (normalized === '') {
      setError('数値を入力してください');
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
      setError('数値を入力してください');
      return;
    }
    if (integer && !Number.isInteger(n)) {
      setError('整数で入力してください');
      return;
    }
    if (n < min || n > max) {
      setError(`${fmtLimit(min)}〜${fmtLimit(max)}${unit ? ` ${unit}` : ''} の範囲で入力してください`);
      return;
    }
    setError(null);
    onChange(n);
  };

  const s = slider === false ? null : slider ?? { min, max, step };
  const pct = s ? Math.max(0, Math.min(100, ((value - s.min) / (s.max - s.min || 1)) * 100)) : 0;

  return (
    <div className={`field${compact ? ' field-compact' : ''}${error ? ' has-error' : ''}`}>
      <div className="field-top">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <div className="field-entry">
          <input
            id={id}
            className="field-input num"
            inputMode={integer || step >= 1 ? 'numeric' : 'decimal'}
            value={text}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
            onFocus={(e) => {
              focused.current = true;
              const el = e.currentTarget;
              // 区切りなしの値に置き換えてから全選択する（同じ処理の中で行い、選択が外れないようにする）
              if (!error) {
                const edit = toEditText(value);
                el.value = edit;
                setText(edit);
              }
              el.select();
            }}
            onBlur={() => {
              focused.current = false;
              if (!error) setText(toText(value));
            }}
            onChange={(e) => commitText(e.target.value)}
            enterKeyHint="done"
          />
          {unit && <span className="field-unit">{unit}</span>}
        </div>
      </div>
      {s && (
        <input
          type="range"
          className="slider"
          aria-label={typeof label === 'string' ? label : undefined}
          min={s.min}
          max={s.max}
          step={s.step}
          value={Math.max(s.min, Math.min(s.max, value))}
          style={{ '--pct': `${pct}%`, '--fill': color ?? 'var(--ink)' } as CSSProperties}
          onChange={(e) => {
            const n = Number(e.target.value);
            setError(null);
            setText(focused.current ? toEditText(n) : toText(n));
            onChange(n);
          }}
        />
      )}
      {aside && <div className="field-aside">{aside}</div>}
      {error ? (
        <p className="field-error" id={`${id}-err`} role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 表示用（3桁区切り）。入力中は区切りなしの値を使う */
function toText(v: number): string {
  if (!Number.isFinite(v)) return '';
  return (Math.round(v * 10000) / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}
function toEditText(v: number): string {
  if (!Number.isFinite(v)) return '';
  return String(Math.round(v * 10000) / 10000);
}
function fmtLimit(n: number): string {
  if (n >= Number.MAX_SAFE_INTEGER) return '';
  return n.toLocaleString('ja-JP');
}

export function Stepper({ value, onChange, min, max, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; format?: (v: number) => string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-btn" aria-label={`${label}を減らす`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon name="minus" size={18} />
      </button>
      <span className="stepper-value num" aria-live="polite">
        {format ? format(value) : value}
      </span>
      <button type="button" className="stepper-btn" aria-label={`${label}を増やす`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, small }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div className={`seg${small ? ' seg-small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <label htmlFor={id} className="toggle-text">
        <span>{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      <input id={id} type="checkbox" role="switch" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, multiline, maxLength = 200, required, type = 'text' }: { label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; maxLength?: number; required?: boolean; type?: 'text' | 'date' | 'month' }) {
  const id = useId();
  const empty = required && value.trim() === '';
  return (
    <div className={`field${empty ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="text-input" value={value} maxLength={maxLength} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="text-input" type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={empty} />
      )}
      {empty && (
        <p className="field-error">
          <Icon name="alert" size={14} /> 入力してください
        </p>
      )}
    </div>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options }: { label: ReactNode; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="select-wrap">
        <select id={id} className="text-input select" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={18} className="select-icon" />
      </div>
    </div>
  );
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** 状態の表示。色だけに頼らずアイコンとラベルを必ず付ける */
export function StatusTag({ tone, children }: { tone: Tone; children: ReactNode }) {
  const icon = tone === 'good' ? 'check' : tone === 'neutral' ? 'info' : 'alert';
  return (
    <span className={`tag tag-${tone}`}>
      <Icon name={icon} size={13} stroke={2.2} />
      {children}
    </span>
  );
}

export function Meter({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ y: number } | null>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    window.setTimeout(() => ref.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      prevFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-layer">
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={ref}
        className={`sheet${wide ? ' sheet-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet-grip"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.y));
          }}
          onPointerUp={() => {
            if (dragY > 90) onClose();
            drag.current = null;
            setDragY(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragY(0);
          }}
        >
          <span className="sheet-handle" />
          <div className="sheet-head">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** 取り消せない操作の確認。confirmText を入力させる強い確認にもできる */
export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel, danger, typeToConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel: string; danger?: boolean; typeToConfirm?: string }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={!ok}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="confirm-body">{message}</div>
      {typeToConfirm && <TextField label={`確認のため「${typeToConfirm}」と入力してください`} value={typed} onChange={setTyped} />}
    </Sheet>
  );
}

export function Empty({ icon = 'spark', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
      {action}
    </div>
  );
}

export function SectionHead({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Disclosure({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <span>{summary}</span>
        <Icon name="chevron-down" size={18} className="disclosure-icon" />
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
