import { addDays, parseISO } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { toCsv } from '../lib/csv';
import { toISODate } from '../lib/format';
import {
  acwrSeries,
  computeAcwr,
  limitState,
  sessionRpeLoad,
  weeklyTotals,
  averageScore,
  itemScore,
  wellnessDropsBelowAverage,
  wellnessLowItems,
  wellnessScore,
  type LoadPoint,
} from '../lib/metrics';

const TH = { acwrLow: 0.8, acwrHigh: 1.3, acwrVeryHigh: 1.5 };

/** 3 sesiones por semana (lunes, miércoles, viernes) durante `weeks` semanas desde el lunes 5 de octubre de 2026. */
function weeksOfLoad(perWeek: number[], srpe: number | null = 300): LoadPoint[] {
  const start = parseISO('2026-10-05');
  return perWeek.flatMap((jumps, w) =>
    [0, 2, 4].map((d) => ({ date: toISODate(addDays(start, w * 7 + d)), jumps, srpe })),
  );
}

describe('computeAcwr', () => {
  it('marca datos insuficientes con menos de 3 semanas de histórico', () => {
    const points = weeksOfLoad([100, 100]);
    const r = computeAcwr(points, '2026-10-18', 'jumps', TH);
    expect(r.status).toBe('insuficiente');
    expect(r.ratio).toBeNull();
    expect(r.daysOfData).toBe(14);
  });

  it('da ratio 1 con carga estable', () => {
    const points = weeksOfLoad([100, 100, 100, 100]);
    // Domingo de la 4.ª semana: 28 días exactos de datos.
    const r = computeAcwr(points, '2026-11-01', 'jumps', TH);
    expect(r.acute).toBe(300);
    expect(r.chronicWeekly).toBe(300);
    expect(r.ratio).toBeCloseTo(1);
    expect(r.status).toBe('optimo');
  });

  it('detecta un pico alto cuando la última semana dobla la carga', () => {
    const points = weeksOfLoad([100, 100, 100, 200]);
    const r = computeAcwr(points, '2026-11-01', 'jumps', TH);
    expect(r.acute).toBe(600);
    expect(r.chronicWeekly).toBe(375);
    expect(r.ratio).toBeCloseTo(1.6);
    expect(r.status).toBe('muy_alto');
  });

  it('clasifica pico moderado y carga baja', () => {
    expect(computeAcwr(weeksOfLoad([100, 100, 100, 150]), '2026-11-01', 'jumps', TH).status).toBe('alto');
    expect(computeAcwr(weeksOfLoad([100, 100, 100, 30]), '2026-11-01', 'jumps', TH).status).toBe('bajo');
  });

  it('ignora sesiones posteriores a la fecha de referencia', () => {
    const points = [...weeksOfLoad([100, 100, 100, 100]), { date: '2026-11-05', jumps: 999, srpe: 999 }];
    expect(computeAcwr(points, '2026-11-01', 'jumps', TH).acute).toBe(300);
  });

  it('en sRPE ignora las sesiones sin RPE', () => {
    const points = weeksOfLoad([100, 100, 100, 100], null);
    const r = computeAcwr(points, '2026-11-01', 'srpe', TH);
    expect(r.status).toBe('insuficiente');
    expect(r.daysOfData).toBe(0);
  });

  it('acwrSeries devuelve un punto por fecha con sesión', () => {
    const series = acwrSeries(weeksOfLoad([100, 100, 100, 100]), 'jumps', TH);
    expect(series).toHaveLength(12);
    expect(series[0].ratio).toBeNull();
    expect(series[series.length - 1].status).toBe('optimo');
  });
});

describe('weeklyTotals', () => {
  it('agrupa por semana ISO y rellena semanas vacías', () => {
    const points: LoadPoint[] = [
      { date: '2026-10-05', jumps: 10, srpe: null },
      { date: '2026-10-11', jumps: 5, srpe: null },
      { date: '2026-10-21', jumps: 7, srpe: null },
    ];
    expect(weeklyTotals(points, 'jumps')).toEqual([
      { week: '2026-10-05', value: 15, sessions: 2 },
      { week: '2026-10-12', value: 0, sessions: 0 },
      { week: '2026-10-19', value: 7, sessions: 1 },
    ]);
  });
});

describe('límites, sRPE y wellness', () => {
  it('limitState', () => {
    expect(limitState(50, undefined, 80)).toBe('none');
    expect(limitState(79, 100, 80)).toBe('ok');
    expect(limitState(80, 100, 80)).toBe('warn');
    expect(limitState(100, 100, 80)).toBe('over');
    expect(limitState(130, 100, 80)).toBe('over');
  });

  it('sessionRpeLoad', () => {
    expect(sessionRpeLoad(7, 90)).toBe(630);
    expect(sessionRpeLoad(undefined, 90)).toBeNull();
    expect(sessionRpeLoad(0, 90)).toBe(0);
  });

  it('wellness', () => {
    const w = { sleep: 2, fatigue: 4, soreness: 1, stress: 5 };
    // 1-5 → 1-10: 3,25 · 7,75 · 1 · 10 → media 5,5 → 6
    expect(wellnessScore(w)).toBe(6);
    expect(wellnessScore(undefined)).toBeNull();
    expect(wellnessScore({})).toBeNull();
    // Cuentan también las preguntas opcionales del cuestionario.
    expect(wellnessScore({ sleep: 5, fatigue: 5, soreness: 5, stress: 5, sleepHours: 1, mood: 1, readiness: 1 })).toBe(6);
    expect(wellnessScore({ sleep: 5, fatigue: 5, soreness: 5, stress: 5 })).toBe(10);
    expect(wellnessScore({ sleep: 1, fatigue: 1, soreness: 1, stress: 1 })).toBe(1);
    expect([1, 2, 3, 4, 5].map(itemScore)).toEqual([1, 3, 6, 8, 10]);
    expect(averageScore([{ sleep: 1 }, { sleep: 5 }, undefined], 'sleep')).toBe(6);
    expect(averageScore([{ mood: 2 }], 'sleep')).toBeNull();
    expect(wellnessLowItems(w, 2)).toEqual(['Calidad del sueño', 'Dolor muscular']);
    expect(wellnessDropsBelowAverage(6, 8)).toBe(true);
    expect(wellnessDropsBelowAverage(7, 8)).toBe(false);
    expect(wellnessDropsBelowAverage(6, null)).toBe(false);
  });
});

describe('toCsv', () => {
  it('genera CSV para Excel en español', () => {
    const csv = toCsv([
      ['Jugadora', 'ACWR'],
      ['Ana; "La Rubia"', 1.256],
      [null, 3],
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual(['Jugadora;ACWR', '"Ana; ""La Rubia""";1,26', ';3']);
  });
});
