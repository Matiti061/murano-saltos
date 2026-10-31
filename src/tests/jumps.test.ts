import { describe, expect, it } from 'vitest';
import { compactedJumps, countEvents, mergeBlockJumps, NO_BLOCK, totalJumps } from '../lib/jumps';
import { summarize, withoutDemo, type Dataset } from '../lib/importData';
import { parseBackup } from '../lib/backup';

describe('saltos compactados', () => {
  it('cuenta toques por jugadora y ejercicio', () => {
    const counts = countEvents([
      { playerId: 'a', blockId: 'b1' },
      { playerId: 'a', blockId: 'b1' },
      { playerId: 'a' },
      { playerId: 'b', blockId: 'b2' },
    ]);
    expect(counts.get('a')).toEqual({ b1: 2, [NO_BLOCK]: 1 });
    expect(counts.get('b')).toEqual({ b2: 1 });
  });

  it('suma compactados, pendientes y ajuste manual', () => {
    const att = { blockJumps: { b1: 10, [NO_BLOCK]: 2 }, manualJumps: -1 };
    expect(compactedJumps(att)).toBe(12);
    expect(totalJumps(att, 3)).toBe(14);
    expect(totalJumps({ manualJumps: 5 }, 0)).toBe(5);
  });

  it('compactar dos veces lo mismo no duplica si se parte del mismo estado', () => {
    const base = { b1: 4 };
    const pending = { b1: 2, b2: 1 };
    expect(mergeBlockJumps(base, pending)).toEqual({ b1: 6, b2: 1 });
    expect(base).toEqual({ b1: 4 });
  });
});

const legacy: Dataset = {
  teams: [
    { id: 1, name: 'Senior', createdAt: 0 },
    { id: 2, name: 'Equipo de ejemplo', demo: true, createdAt: 0 },
  ],
  players: [
    { id: 1, teamId: 1, name: 'Ana', position: 'Armadora', status: 'activa', archived: 0, createdAt: 0 },
    { id: 2, teamId: 2, name: 'Demo', position: 'Central', status: 'activa', archived: 0, createdAt: 0 },
  ],
  sessions: [
    { id: 1, teamId: 1, date: '2026-10-01', type: 'entrenamiento', status: 'finalizado', mode: 'vivo', startedAt: 0 },
    { id: 2, teamId: 2, date: '2026-10-01', type: 'entrenamiento', status: 'finalizado', mode: 'vivo', startedAt: 0 },
  ],
  attendance: [
    { id: 1, sessionId: 1, playerId: 1, status: 'presente', manualJumps: 0, jumps: 2 },
    { id: 2, sessionId: 2, playerId: 2, status: 'presente', manualJumps: 0, jumps: 1 },
  ],
  blocks: [{ id: 1, sessionId: 1, name: 'Bloqueo', order: 1, startedAt: 0 }],
  jumpEvents: [
    { id: 1, sessionId: 1, playerId: 1, blockId: 1, ts: 1 },
    { id: 2, sessionId: 1, playerId: 1, ts: 2 },
    { id: 3, sessionId: 2, playerId: 2, ts: 3 },
  ],
  complaints: [{ id: 1, playerId: 2, date: '2026-10-01', zone: 'Rodilla', side: 'derecha', intensity: 2, kind: 'molestia', createdAt: 0 }],
  settings: [{ clubName: 'Club Voleibol Murano' }],
};

describe('importación de datos antiguos', () => {
  it('quita el equipo de ejemplo y todo lo suyo', () => {
    const clean = withoutDemo(legacy);
    expect(summarize(clean)).toEqual({ teams: 1, players: 1, sessions: 1, complaints: 0, teamNames: ['Senior'] });
    expect(clean.jumpEvents).toHaveLength(2);
    expect(clean.attendance.map((a) => a.id)).toEqual([1]);
  });

  it('lee copias de seguridad v2 con toques en tuplas y v3 de la nube', () => {
    const v2 = parseBackup(
      JSON.stringify({
        app: 'murano-saltos',
        version: 2,
        exportedAt: '2026-10-30T10:00:00Z',
        data: { ...legacy, jumpEvents: [[1, 1, 1, 1, 1], [2, 1, 1, null, 2]] },
      }),
    );
    expect(v2.dataset.jumpEvents).toEqual([
      { id: 1, sessionId: 1, playerId: 1, blockId: 1, ts: 1 },
      { id: 2, sessionId: 1, playerId: 1, ts: 2 },
    ]);
    expect(v2.summary.teams).toBe(2);
    expect(() => parseBackup('{"app":"otra"}')).toThrow('no es una copia');
    expect(() => parseBackup(JSON.stringify({ app: 'murano-saltos', version: 99, data: {} }))).toThrow('más nueva');
  });
});
