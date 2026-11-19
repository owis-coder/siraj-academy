import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { IconCheck, IconClose, IconInfo } from '../components/icons';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };

const Ctx = createContext<{ push: (kind: Toast['kind'], text: string) => void }>(null as unknown as { push: (k: Toast['kind'], t: string) => void });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((v) => [...v, { id, kind, text }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 end-6 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center animate-fadeUp rounded-[10px] border px-4 py-3 text-sm shadow-card ${
              t.kind === 'success'
                ? 'border-ok/40 bg-ok/10 text-ink-primary'
                : t.kind === 'error'
                  ? 'border-danger/40 bg-danger/10 text-ink-primary'
                  : 'border-gold/40 bg-surface text-ink-primary'
            }`}
          >
            <span aria-hidden className="me-2 inline-flex shrink-0">
              {t.kind === 'success' ? (
                <IconCheck className="size-4 text-emerald-500" />
              ) : t.kind === 'error' ? (
                <IconClose className="size-4 text-coral" />
              ) : (
                <IconInfo className="size-4 text-gold-300" />
              )}
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
