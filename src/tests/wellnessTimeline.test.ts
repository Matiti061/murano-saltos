import { describe, expect, it } from 'vitest';
import type { PlayerSessionRow } from '../db/history';
import type { FormResponse } from '../db/types';
import { wellnessTimeline } from '../lib/wellnessTimeline';

const row = (date: string, sleep?: number): PlayerSessionRow =>
  ({
    session: { id: `s-${date}`, teamId: 't', date, startedAt: new Date(`${date}T18:00`).getTime() },
    attendance: { id: `a-${date}`, sessionId: `s-${date}`, playerId: 'p', status: 'presente', wellness: sleep ? { sleep, fatigue: 3, soreness: 3, stress: 3 } : undefined },
  }) as PlayerSessionRow;

const resp = (id: string, date: string, time: string, sleep: number, kind: 'pre' | 'rpe' = 'pre'): FormResponse =>
  ({ id, teamId: 't', playerId: 'p', date, kind, submittedAt: new Date(`${date}T${time}`).getTime(), values: { wellness: { sleep } }, raw: {}, importedAt: 0 }) as FormResponse;

describe('wellnessTimeline', () => {
  it('junta entrenamientos y encuestas de días sin entreno, sin duplicar días', () => {
    const out = wellnessTimeline(
      [row('2026-11-02', 4), row('2026-11-05')],
      [
        resp('r1', '2026-10-29', '09:00', 2),
        resp('r2', '2026-10-29', '15:00', 3), // vale la última del día
        resp('r3', '2026-11-02', '10:00', 1), // ese día manda el entrenamiento
        resp('r4', '2026-11-05', '10:00', 5), // entreno sin wellness → la encuesta
        resp('r5', '2026-11-06', '20:00', 1, 'rpe'), // el RPE no es wellness
      ],
    );
    expect(out.map((e) => [e.date, e.sessionId ?? null, e.wellness.sleep])).toEqual([
      ['2026-10-29', null, 3],
      ['2026-11-02', 's-2026-11-02', 4],
      ['2026-11-05', null, 5],
    ]);
  });
});
