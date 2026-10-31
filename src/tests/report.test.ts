import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Attendance, type Block, type JumpEvent, type Player } from '../db/types';
import { sessionCsv } from '../lib/csv';
import { createSessionPdf, sessionPdfFilename } from '../lib/pdf/sessionReport';
import { buildReport, type ReportRaw } from '../lib/report';

const players: Player[] = [
  { id: 'p1', teamId: 't1', name: 'Lucía Martín', position: 'Armadora', status: 'activa', archived: 0, createdAt: 0 },
  { id: 'p2', teamId: 't1', name: 'Nerea Torres', position: 'Punta receptora', status: 'readaptacion', jumpLimit: 3, archived: 0, createdAt: 0 },
  { id: 'p3', teamId: 't1', name: 'Andrea Vega', position: 'Líbero', status: 'activa', archived: 0, createdAt: 0 },
];

const start = new Date('2026-10-28T18:00:00').getTime();
const blocks: Block[] = [
  { id: 'b11', sessionId: 's7', name: 'Calentamiento', order: 1, startedAt: start, endedAt: start + 10 * 60_000 },
  { id: 'b12', sessionId: 's7', name: 'Bloqueo', order: 2, startedAt: start + 10 * 60_000, endedAt: start + 30 * 60_000 },
];

function ev(playerId: string, blockId: string | undefined, n: number): JumpEvent[] {
  return Array.from({ length: n }, () => ({ sessionId: 's7', playerId, ts: start, ...(blockId ? { blockId } : {}) }));
}

// Lucía: 2 saltos ya compactados en el calentamiento + 5 toques pendientes en bloqueo + 1 sin ejercicio.
const events = [...ev('p1', 'b12', 5), ...ev('p2', 'b12', 3), ...ev('p1', undefined, 1)];

const attendance: Attendance[] = [
  { id: 'a1', sessionId: 's7', playerId: 'p1', status: 'presente', manualJumps: 0, blockJumps: { b11: 2 }, jumps: 8, minutes: 90, rpe: 7, wellness: { sleep: 2, fatigue: 4, soreness: 4, stress: 4 } },
  { id: 'a2', sessionId: 's7', playerId: 'p2', status: 'parcial', manualJumps: 0, jumps: 3, minutes: 45, rpe: 5 },
  { id: 'a3', sessionId: 's7', playerId: 'p3', status: 'ausente', manualJumps: 0, jumps: 0 },
];

const raw: ReportRaw = {
  session: {
    id: 's7',
    teamId: 't1',
    date: '2026-10-28',
    type: 'entrenamiento',
    status: 'finalizado',
    mode: 'vivo',
    startedAt: start,
    endedAt: start + 90 * 60_000,
    durationMin: 90,
    notes: 'Buena intensidad. Ojo con la recepción.',
  },
  team: { id: 't1', name: 'Senior Femenino', createdAt: 0 },
  settings: DEFAULT_SETTINGS,
  players,
  attendance,
  blocks,
  events,
  history: new Map([
    ['p1', [{ date: '2026-10-28', jumps: 8, srpe: 630 }]],
    ['p2', [{ date: '2026-10-28', jumps: 3, srpe: 225 }]],
  ]),
  wellnessAvg: new Map(),
  complaints: [
    { id: 'c1', playerId: 'p2', sessionId: 's7', date: '2026-10-28', zone: 'Rodilla', side: 'derecha', intensity: 4, kind: 'molestia', createdAt: 0 },
  ],
  now: start + 100 * 60_000,
};

describe('buildReport', () => {
  const data = buildReport(raw);

  it('separa presentes y ausentes y ordena por posición', () => {
    expect(data.rows.map((r) => r.player.name)).toEqual(['Lucía Martín', 'Nerea Torres']);
    expect(data.absent.map((a) => a.player.name)).toEqual(['Andrea Vega']);
    expect(data.totals).toMatchObject({ jumps: 11, present: 2, convened: 3 });
    expect(data.totals.avg).toBeCloseTo(5.5);
    expect(data.totals.max).toEqual({ name: 'Lucía Martín', jumps: 8 });
  });

  it('reparte los saltos por ejercicio', () => {
    const lucia = data.rows[0];
    expect(lucia.perBlock).toEqual({ b11: 2, b12: 5 });
    expect(lucia.jumps).toBe(8);
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
    expect(texts).toContain('Nerea Torres ha alcanzado su límite de saltos: 3/3 (100%)');
    expect(texts).toContain('Lucía Martín: wellness bajo en sueño');
    expect(texts).toContain('Nerea Torres está en readaptación');
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
    expect(lines[1]).toContain('Lucía Martín;Armadora;Presente;8');
    expect(lines[3]).toContain('Andrea Vega;Líbero;Ausente');
  });
});
