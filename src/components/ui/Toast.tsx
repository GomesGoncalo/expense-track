import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { cx } from '../../utils/cx';

export type ToastTone = 'default' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  duration?: number;
}

interface ToastEntry {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON: Record<ToastTone, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

/** Keeps a burst of near-simultaneous toasts (e.g. several quick actions in a row) from stacking up and covering the page. */
const MAX_VISIBLE_TOASTS = 3;

let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    ({ message, tone = 'default', duration = 4000 }: ToastOptions) => {
      const id = `toast-${++nextToastId}`;
      setToasts((prev) => {
        const next = [...prev, { id, message, tone }];
        const overflow = next.length - MAX_VISIBLE_TOASTS;
        if (overflow > 0) {
          for (const dropped of next.splice(0, overflow)) {
            const timer = timers.current.get(dropped.id);
            if (timer) {
              clearTimeout(timer);
              timers.current.delete(dropped.id);
            }
          }
        }
        return next;
      });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-viewport">
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone];
          return (
            <div key={toast.id} className={cx('toast', toast.tone !== 'default' && `toast-${toast.tone}`)} role="status">
              <Icon size={16} className="toast-icon" aria-hidden="true" />
              <span className="toast-message">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
