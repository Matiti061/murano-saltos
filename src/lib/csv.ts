import { ATTENDANCE_LABEL } from '../db/types';
import { fmtTime } from './format';
import { ACWR_LABEL } from './metrics';
import type { SessionReportData } from './report';

export type CsvCell = string | number | null | undefined;

function cell(v: CsvCell): string {
  if (v == null) return '';
  // Excel en español usa coma decimal.
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV listo para Excel en español: BOM UTF-8, separador «;» y coma decimal. */
export function toCsv(rows: CsvCell[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

export function sessionCsv(data: SessionReportData): string {
  const blockHeads = data.blocks.map((b) => `${b.block.order}. ${b.block.name}`);
  const head: CsvCell[] = [
    'Fecha',
    'Equipo',
    'Jugadora',
    'Posición',
    'Asistencia',
    'Saltos',
    'Límite',
    '% límite',
    'Minutos',
    'RPE',
    'sRPE',
    'Sueño',
    'Fatiga',
    'Dolor muscular',
    'Estrés',
    'Wellness total',
    'Horas de sueño (1-5)',
    'Ánimo',
    'Preparación',
    'Molestia (0-3)',
    'Mensaje al entrenador',
    'ACWR saltos',
    'Estado ACWR saltos',
    'ACWR sRPE',
    'Estado ACWR sRPE',
    ...blockHeads,
    ...(data.showNoBlock ? ['Sin ejercicio / ajuste'] : []),
  ];
  const rows: CsvCell[][] = data.rows.map((r) => {
    const w = r.attendance.wellness;
    return [
      data.session.date,
      data.team?.name,
      r.player.name,
      r.player.position,
      ATTENDANCE_LABEL[r.attendance.status],
      r.jumps,
      r.limit,
      r.limitPct,
      r.minutes,
      r.rpe,
      r.srpe,
      w?.sleep,
      w?.fatigue,
      w?.soreness,
      w?.stress,
      r.wellnessTotal,
      w?.sleepHours,
      w?.mood,
      w?.readiness,
      r.attendance.discomfort,
      r.attendance.playerNote,
      r.acwrJumps.ratio,
      ACWR_LABEL[r.acwrJumps.status],
      r.acwrSrpe.ratio,
      ACWR_LABEL[r.acwrSrpe.status],
      ...data.blocks.map((b) => r.perBlock[b.block.id!] ?? 0),
      ...(data.showNoBlock ? [r.noBlock] : []),
    ];
  });
  const absent: CsvCell[][] = data.absent.map((a) => [
    data.session.date,
    data.team?.name,
    a.player.name,
    a.player.position,
    ATTENDANCE_LABEL[a.status],
  ]);
  const blocks: CsvCell[][] = [
    [],
    ['Ejercicio', 'Inicio', 'Duración (min)', 'Saltos', 'Saltos/min'],
    ...data.blocks.map((b) => [b.block.name, fmtTime(b.block.startedAt), b.durationMin, b.jumps, b.perMin]),
  ];
  return toCsv([head, ...rows, ...absent, ...(data.blocks.length ? blocks : [])]);
}
