import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { IconClose, IconChevronDown, IconCheck, IconFolder, IconEye, IconEyeOff } from './icons';
import { AnimatedCounter } from './AnimatedCounter';

export { AnimatedCounter };

/* ============ Button ============ */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gold-300/50 disabled:opacity-60 disabled:pointer-events-none';
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-5 py-2.5 text-sm';
  const variants = {
    primary: 'bg-gold-grad text-cham shadow-glow hover:brightness-110 hover:-translate-y-0.5',
    ghost: 'text-ink-secondary hover:text-ink-primary hover:bg-elevated/60',
    outline: 'border border-line-gold text-gold-200 hover:bg-gold-500/10 hover:border-gold-400/60',
    danger: 'bg-danger/15 border border-danger/40 text-coral hover:bg-danger/25',
    subtle: 'bg-elevated/70 border border-line text-ink-secondary hover:bg-elevated hover:text-ink-primary',
  }[variant];
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-gold-300/30 border-t-gold-300 ${className}`}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}

/* ============ Card ============ */
export function Card({ className = '', hover, children }: { className?: string; hover?: boolean; children: ReactNode }) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface shadow-card transition-all duration-300 ${
        hover ? 'hover:bg-surface-2 hover:shadow-card-hover hover:-translate-y-1' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ============ Badge ============ */
const BADGE_TONES: Record<string, string> = {
  ok: 'bg-ok/15 text-emerald-800 dark:text-emerald-300 border-ok/35',
  danger: 'bg-danger/15 text-red-700 dark:text-coral border-danger/35',
  warn: 'bg-warn/12 text-amber-800 dark:text-gold-200 border-warn/35',
  gold: 'bg-gold-500/12 text-amber-800 dark:text-gold-200 border-gold/35',
  muted: 'bg-elevated/70 text-ink-muted border-line',
  info: 'bg-teal/10 text-cyan-800 dark:text-sky-300 border-teal/35',
  coral: 'bg-coral/12 text-rose-700 dark:text-coral border-coral/35',
};

export function Badge({ tone = 'muted', className = '', children }: { tone?: keyof typeof BADGE_TONES | string; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone] ?? BADGE_TONES.muted} ${className}`}>
      {children}
    </span>
  );
}

/* ============ Fields ============ */
export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-secondary">
        {label}
        {required && <span className="text-coral"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-coral">{error}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input-base ${className}`} {...rest} />;
}

export function PasswordInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();

  return (
    <div className="relative w-full">
      <input
        type={visible ? 'text' : 'password'}
        className={`input-base pe-11 ${className}`}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        title={visible ? t('common.hidePassword') : t('common.showPassword')}
        className="absolute inset-y-0 end-0 flex items-center pe-3 text-ink-muted hover:text-ink-secondary focus:outline-none transition-colors"
      >
        {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input-base ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input-base min-h-24 resize-y ${className}`} {...rest} />;
}

/* ============ Tabs ============ */
export function Tabs({
  tabs,
  active,
  onChange,
  className = '',
  fullWidth = false,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (k: string) => void;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-1 rounded-lg border border-line bg-surface/80 p-1 ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
            fullWidth ? 'flex-1 text-center justify-center' : ''
          } ${
            active === t.key ? 'bg-elevated text-gold-200 shadow-glow' : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ms-1.5 rounded bg-elevated px-1.5 py-0.5 text-[10px] text-ink-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ============ Accordion ============ */
export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start font-semibold text-ink-primary transition-colors hover:text-gold-200"
            aria-expanded={open === i}
          >
            <span>{it.q}</span>
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-gold text-gold-200">
              <IconChevronDown className={`size-3.5 transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {open === i && <p className="px-5 pb-4 text-sm leading-7 text-ink-secondary">{it.a}</p>}
        </div>
      ))}
    </div>
  );
}

/* ============ Modal ============ */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();

  // قفل تمرير الصفحة + الإغلاق بمفتاح Escape (توافق لوحة المفاتيح والجوال)
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[85vh] w-full overflow-y-auto overscroll-contain rounded-lg border border-line-gold bg-surface p-4 shadow-glow animate-fadeUp supports-[height:100dvh]:max-h-[85dvh] sm:p-6 ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-lg font-bold text-ink-primary">{title}</h3>
          <button
            onClick={onClose}
            className="no-min-target grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-colors hover:text-coral"
            aria-label={t('common.close')}
          >
            <IconClose className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============ EmptyState ============ */
export function EmptyState({ title, hint, action, compact, icon }: { title: string; hint?: string; action?: ReactNode; compact?: boolean; icon?: ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface/50 text-center ${compact ? 'px-6 py-8' : 'px-6 py-16'}`}>
      <div className="mb-3 grid size-12 place-items-center rounded-full border border-line-gold bg-elevated/60 text-gold-300" aria-hidden>
        {icon ?? <IconFolder className="size-6" />}
      </div>
      <p className="font-semibold text-ink-primary">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ============ Skeleton ============ */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-lg bg-elevated/60 ${className}`}
      style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(245,241,234,.05), transparent)', backgroundSize: '200% 100%' }}
    />
  );
}

export function SkeletonGrid({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="mb-2 h-3.5 w-full" />
          <Skeleton className="mb-4 h-3.5 w-1/2" />
          <Skeleton className="h-9 w-24" />
        </Card>
      ))}
    </div>
  );
}

/* ============ StatCard ============ */
export function StatCard({ label, value, hint, tone = 'gold' }: { label: string; value: string | number | null | undefined; hint?: string; tone?: 'gold' | 'teal' | 'ok' | 'coral' }) {
  const bar = { gold: 'bg-gold-grad', teal: 'bg-teal/60', ok: 'bg-ok/60', coral: 'bg-coral/60' }[tone];
  return (
    <Card hover className="group relative overflow-hidden p-5 transition-all duration-300 hover:shadow-lg hover:shadow-gold-500/5">
      <span className={`absolute inset-y-0 start-0 w-1 ${bar}`} aria-hidden />
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-2 font-bold text-ink-primary">
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          <AnimatedCounter value={value} />
        </span>
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

/* ============ Pagination ============ */
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 9) }, (_, i) =>
    Math.max(1, Math.min(page - 4, Math.max(1, totalPages - 8))) + i,
  ).filter((p) => p <= totalPages);
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <Button variant="subtle" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t('common.previous')}</Button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`size-8 rounded-md text-sm transition-colors ${p === page ? 'bg-gold-grad font-bold text-cham' : 'border border-line text-ink-secondary hover:bg-elevated'}`}
        >
          {p}
        </button>
      ))}
      <Button variant="subtle" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>{t('common.next')}</Button>
    </div>
  );
}

/* ============ Steps ============ */
export function Steps({ current, steps, onGo, className = '' }: { current: number; steps: { key: string; label: string }[]; onGo?: (n: number) => void; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onGo?.(n)}
              disabled={!onGo}
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                active ? 'bg-gold-grad text-cham' : done ? 'border border-line-gold bg-gold-500/15 text-gold-200' : 'border border-line text-ink-muted'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <IconCheck className="size-3.5 stroke-[2.5]" /> : n}
            </button>
            <span className={`truncate text-xs ${active ? 'font-semibold text-gold-200' : 'text-ink-muted'}`}>{s.label}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-default" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

/* ============ Form helper ============ */
export function useForm<R>(initial: R) {
  const [values, setValues] = useState<R>(initial);
  const set = <K extends keyof R>(k: K, v: R[K]) => setValues((s) => ({ ...s, [k]: v }));
  return { values, set, setValues, reset: () => setValues(initial) };
}

export function Form({ onSubmit, className = '', children }: { onSubmit: (e: FormEvent) => void; className?: string; children: ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
      className={className}
      noValidate
    >
      {children}
    </form>
  );
}
