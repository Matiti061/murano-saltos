import { addDays, differenceInCalendarDays, parseISO, startOfISOWeek } from 'date-fns';
import type { Wellness } from '../db/types';
import { toISODate } from './format';

/** Carga de una jugadora en una sesión. */
export interface LoadPoint {
  /** yyyy-MM-dd */
  date: string;
  jumps: number;
  /** RPE × minutos; null si no se registró RPE. */
  srpe: number | null;
}

export type LoadMetric = 'jumps' | 'srpe';

export interface AcwrThresholds {
  acwrLow: number;
  acwrHigh: number;
  acwrVeryHigh: number;
}

export type AcwrStatus = 'insuficiente' | 'bajo' | 'optimo' | 'alto' | 'muy_alto';

export interface AcwrResult {
  /** Carga de los últimos 7 días (incluido el día de referencia). */
  acute: number;
  /** Media semanal de los últimos 28 días. */
  chronicWeekly: number;
  ratio: number | null;
  status: AcwrStatus;
  /** Días desde el primer registro hasta la fecha de referencia. */
  daysOfData: number;
}

/** Días mínimos de histórico para que el ratio tenga sentido. */
export const MIN_DAYS_FOR_ACWR = 21;

export const ACWR_LABEL: Record<AcwrStatus, string> = {
  insuficiente: 'Sin datos suficientes',
  bajo: 'Carga baja',
  optimo: 'Óptimo',
  alto: 'Pico de carga',
  muy_alto: 'Pico alto',
};

function metricValue(p: LoadPoint, metric: LoadMetric): number | null {
  return metric === 'jumps' ? p.jumps : p.srpe;
}

export function classifyAcwr(ratio: number, th: AcwrThresholds): AcwrStatus {
  if (ratio < th.acwrLow) return 'bajo';
  if (ratio <= th.acwrHigh) return 'optimo';
  if (ratio <= th.acwrVeryHigh) return 'alto';
  return 'muy_alto';
}

/**
 * Ratio agudo:crónico (media móvil): carga de 7 días frente a la media
 * semanal de los últimos 28 días.
 */
export function computeAcwr(
  points: LoadPoint[],
  refDate: string,
  metric: LoadMetric,
  th: AcwrThresholds,
): AcwrResult {
  const ref = parseISO(refDate);
  let acute = 0;
  let chronic = 0;
  let earliest: Date | null = null;

  for (const p of points) {
    const v = metricValue(p, metric);
    if (v == null) continue;
    const d = parseISO(p.date);
    const diff = differenceInCalendarDays(ref, d);
    if (diff < 0) continue;
    if (!earliest || d < earliest) earliest = d;
    if (diff < 7) acute += v;
    if (diff < 28) chronic += v;
  }

  const daysOfData = earliest ? differenceInCalendarDays(ref, earliest) + 1 : 0;
  const chronicWeekly = chronic / 4;
  if (daysOfData < MIN_DAYS_FOR_ACWR || chronicWeekly <= 0) {
    return { acute, chronicWeekly, ratio: null, status: 'insuficiente', daysOfData };
  }
  const ratio = acute / chronicWeekly;
  return { acute, chronicWeekly, ratio, status: classifyAcwr(ratio, th), daysOfData };
}

/** ACWR calculado en cada fecha con sesión, para dibujar su evolución. */
export function acwrSeries(points: LoadPoint[], metric: LoadMetric, th: AcwrThresholds) {
  const dates = [...new Set(points.map((p) => p.date))].sort();
  return dates.map((date) => {
    const r = computeAcwr(points, date, metric, th);
    return { date, ratio: r.ratio, status: r.status };
  });
}

export interface WeekTotal {
  /** Lunes de la semana, yyyy-MM-dd */
  week: string;
  value: number;
  sessions: number;
}

/** Totales por semana (lunes a domingo), rellenando las semanas vacías. */
export function weeklyTotals(points: LoadPoint[], metric: LoadMetric): WeekTotal[] {
  const map = new Map<string, WeekTotal>();
  for (const p of points) {
    const v = metricValue(p, metric);
    if (v == null) continue;
    const week = toISODate(startOfISOWeek(parseISO(p.date)));
    const cur = map.get(week) ?? { week, value: 0, sessions: 0 };
    cur.value += v;
    cur.sessions += 1;
    map.set(week, cur);
  }
  if (map.size === 0) return [];
  const weeks = [...map.keys()].sort();
  const out: WeekTotal[] = [];
  for (let d = parseISO(weeks[0]); toISODate(d) <= weeks[weeks.length - 1]; d = addDays(d, 7)) {
    const key = toISODate(d);
    out.push(map.get(key) ?? { week: key, value: 0, sessions: 0 });
  }
  return out;
}

export function sessionRpeLoad(rpe?: number | null, minutes?: number | null): number | null {
  if (rpe == null || minutes == null) return null;
  return rpe * minutes;
}

export type LimitState = 'none' | 'ok' | 'warn' | 'over';

export function limitState(jumps: number, limit: number | undefined, warnPct: number): LimitState {
  if (!limit || limit <= 0) return 'none';
  const pct = (jumps / limit) * 100;
  if (pct >= 100) return 'over';
  if (pct >= warnPct) return 'warn';
  return 'ok';
}

export type CoreWellnessKey = 'sleep' | 'fatigue' | 'soreness' | 'stress';
export type ExtraWellnessKey = 'sleepHours' | 'mood' | 'readiness';

/** Los 4 ítems que suman el total /20. */
export const WELLNESS_ITEMS: { key: CoreWellnessKey; label: string; low: string; high: string }[] = [
  { key: 'sleep', label: 'Sueño', low: 'Muy malo', high: 'Excelente' },
  { key: 'fatigue', label: 'Fatiga', low: 'Agotada', high: 'Muy fresca' },
  { key: 'soreness', label: 'Dolor muscular', low: 'Mucho dolor', high: 'Sin dolor' },
  { key: 'stress', label: 'Estrés', low: 'Muy estresada', high: 'Muy relajada' },
];

/** Ítems opcionales del formulario del profesor (no suman al total, sí generan alertas). */
export const WELLNESS_EXTRA_ITEMS: { key: ExtraWellnessKey; label: string; low: string; high: string }[] = [
  { key: 'sleepHours', label: 'Horas de sueño', low: 'Menos de 5 h', high: 'Más de 8 h' },
  { key: 'mood', label: 'Ánimo', low: 'Muy desanimada', high: 'Muy animada' },
  { key: 'readiness', label: 'Preparación', low: 'Nada preparada', high: 'Totalmente preparada' },
];

/** Texto de las 5 opciones de horas de sueño (1 a 5). */
export const SLEEP_HOURS_LABELS = ['', '< 5 h', '5–6 h', '6–7 h', '7–8 h', '> 8 h'];

export function wellnessTotal(w?: Wellness | null): number | null {
  if (!w) return null;
  return w.sleep + w.fatigue + w.soreness + w.stress;
}

/** Ítems de wellness iguales o por debajo del umbral (incluidos los opcionales; < 6 h de sueño cuenta como bajo). */
export function wellnessLowItems(w: Wellness | null | undefined, itemThreshold: number): string[] {
  if (!w) return [];
  const core = WELLNESS_ITEMS.filter((i) => w[i.key] <= itemThreshold).map((i) => i.label);
  const extra = WELLNESS_EXTRA_ITEMS.filter((i) => {
    const v = w[i.key];
    return v != null && (i.key === 'sleepHours' ? v <= 2 : v <= itemThreshold);
  }).map((i) => i.label);
  return [...core, ...extra];
}

/** Puntos por debajo de su media personal a partir de los cuales se avisa. */
export const WELLNESS_DROP_ALERT = 3;

export function wellnessDropsBelowAverage(total: number | null, personalAvg: number | null): boolean {
  if (total == null || personalAvg == null) return false;
  return total <= personalAvg - WELLNESS_DROP_ALERT;
}

export const RPE_LABELS: Record<number, string> = {
  0: 'Reposo',
  1: 'Muy, muy fácil',
  2: 'Fácil',
  3: 'Moderado',
  4: 'Algo duro',
  5: 'Duro',
  6: 'Duro +',
  7: 'Muy duro',
  8: 'Muy duro +',
  9: 'Casi máximo',
  10: 'Máximo',
};

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
