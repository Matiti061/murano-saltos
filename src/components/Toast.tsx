import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cx } from './ui';

type Tone = 'info' | 'success' | 'warning' | 'error';
interface ToastState {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TONES: Record<Tone, string> = {
  info: 'bg-slate-900 text-white',
  success: 'bg-emerald-700 text-white',
  warning: 'bg-amber-500 text-slate-900',
  error: 'bg-red-600 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, tone: Tone = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = window.setTimeout(() => setToast(null), tone === 'warning' || tone === 'error' ? 4000 : 2500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={cx(
            'toast-in fixed bottom-6 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg',
            TONES[toast.tone],
          )}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
