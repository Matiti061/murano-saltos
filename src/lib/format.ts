import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const toISODate = (d: Date | number) => format(d, 'yyyy-MM-dd');
export const todayISO = () => toISODate(new Date());

export const fmtDateLong = (iso: string) =>
  format(parseISO(iso), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
export const fmtDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy');
export const fmtDateShort = (iso: string) => format(parseISO(iso), 'dd/MM');
export const fmtDayMonth = (iso: string) => format(parseISO(iso), 'd MMM', { locale: es });
export const fmtTime = (ts: number) => format(ts, 'HH:mm');

export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return '–';
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Texto apto para nombres de archivo: sin acentos ni espacios. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** «1 salto», «3 saltos». */
export const jumpsLabel = (n: number) => `${fmtNum(n)} ${n === 1 ? 'salto' : 'saltos'}`;
