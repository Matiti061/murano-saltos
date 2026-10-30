import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Attendance, type Block, type JumpEvent, type Player } from '../db/types';
import { sessionCsv } from '../lib/csv';
import { createSessionPdf, sessionPdfFilename } from '../lib/pdf/sessionReport';
import { buildReport, type ReportRaw } from '../lib/report';

const players: Player[] = [
  { id: 1, teamId: 1, name: 'Lucía Martín', number: 1, position: 'Colocadora', status: 'activa', archived: 0, createdAt: 0 },
  { id: 2, teamId: 1, name: 'Nerea Torres', number: 10, position: 'Receptora', status: 'readaptacion', jumpLimit: 3, archived: 0, createdAt: 0 },
  { id: 3, teamId: 1, name: 'Andrea Vega', number: 5, position: 'Líbero', status: 'activa', archived: 0, createdAt: 0 },
];

const start = new Date('2026-10-28T18:00:00').getTime();
const blocks: Block[] = [
  { id: 11, sessionId: 7, name: 'Calentamiento', order: 1, startedAt: start, endedAt: start + 10 * 60_000 },
  { id: 12, sessionId: 7, name: 'Bloqueo', order: 2, startedAt: start + 10 * 60_000, endedAt: start + 30 * 60_000 },
];

function ev(playerId: number, blockId: number | undefined, n: number): JumpEvent[] {
  return Array.from({ length: n }, () => ({ sessionId: 7, playerId, blockId, ts: start }));
}

const events = [...ev(1, 11, 2), ...ev(1, 12, 5), ...ev(2, 12, 3), ...ev(1, undefined, 1)];

const attendance: Attendance[] = [
  { id: 1, sessionId: 7, playerId: 1, status: 'presente', manualJumps: 0, jumps: 8, minutes: 90, rpe: 7, wellness: { sleep: 2, fatigue: 4, soreness: 4, stress: 4 } },
  { id: 2, sessionId: 7, playerId: 2, status: 'parcial', manualJumps: 0, jumps: 3, minutes: 45, rpe: 5 },
  { id: 3, sessionId: 7, playerId: 3, status: 'ausente', manualJumps: 0, jumps: 0 },
];

const raw: ReportRaw = {
  session: {
    id: 7,
    teamId: 1,
    date: '2026-10-28',
    type: 'entrenamiento',
    status: 'finalizado',
    mode: 'vivo',
    startedAt: start,
    endedAt: start + 90 * 60_000,
    durationMin: 90,
    notes: 'Buena intensidad. Ojo con la recepción.',
  },
  team: { id: 1, name: 'Senior Femenino', createdAt: 0 },
  settings: DEFAULT_SETTINGS,
  players,
  attendance,
  blocks,
  events,
  history: new Map([
    [1, [{ date: '2026-10-28', jumps: 8, srpe: 630 }]],
    [2, [{ date: '2026-10-28', jumps: 3, srpe: 225 }]],
  ]),
  wellnessAvg: new Map(),
  complaints: [
    { id: 1, playerId: 2, sessionId: 7, date: '2026-10-28', zone: 'Rodilla', side: 'derecha', intensity: 4, kind: 'molestia', createdAt: 0 },
  ],
  now: start + 100 * 60_000,
};

describe('buildReport', () => {
  const data = buildReport(raw);

  it('separa presentes y ausentes y ordena por dorsal', () => {
    expect(data.rows.map((r) => r.player.name)).toEqual(['Lucía Martín', 'Nerea Torres']);
    expect(data.absent.map((a) => a.player.name)).toEqual(['Andrea Vega']);
    expect(data.totals).toMatchObject({ jumps: 11, present: 2, convened: 3 });
    expect(data.totals.avg).toBeCloseTo(5.5);
    expect(data.totals.max).toEqual({ name: 'Lucía Martín (#1)', jumps: 8 });
  });

  it('reparte los saltos por ejercicio', () => {
    const lucia = data.rows[0];
    expect(lucia.perBlock).toEqual({ 11: 2, 12: 5 });
    expect(lucia.noBlock).toBe(1);
    expect(lucia.srpe).toBe(630);
    expect(data.showNoBlock).toBe(true);
    expect(data.blocks.map((b) => [b.block.name, b.jumps, b.durationMin])).toEqual([
      ['Calentamiento', 2, 10],
      ['Bloqueo', 8, 20],
    ]);
    expect(data.blocks[1].perMin).toBeCloseTo(0.4);
  });

  it('genera alertas de límite, wellness, readaptación y molestias', () => {
    const texts = data.alerts.map((a) => a.text).join('\n');
    expect(data.rows[1].limitState).toBe('over');
    expect(texts).toContain('Nerea Torres (#10) ha alcanzado su límite de saltos: 3/3 (100%)');
    expect(texts).toContain('Lucía Martín (#1): wellness bajo en sueño');
    expect(texts).toContain('Nerea Torres (#10) está en readaptación');
    expect(texts).toContain('molestia en rodilla derecha (4/10)');
    expect(data.alerts[0].level).toBe('alta');
  });
});

describe('PDF y CSV de la sesión', () => {
  const data = buildReport(raw);

  it('genera un PDF válido', () => {
    const doc = createSessionPdf(data);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(sessionPdfFilename(data)).toBe('Entreno_Senior_Femenino_2026-10-28.pdf');
  });

  it('genera el CSV con una fila por jugadora convocada', () => {
    const lines = sessionCsv(data).slice(1).split('\r\n');
    expect(lines[0]).toContain('Jugadora;Posición;Asistencia;Saltos');
    expect(lines[0]).toContain('1. Calentamiento;2. Bloqueo;Sin ejercicio / ajuste');
    expect(lines[1]).toContain('Lucía Martín;Colocadora;Presente;8');
    expect(lines[3]).toContain('Andrea Vega;Líbero;Ausente');
  });
});
