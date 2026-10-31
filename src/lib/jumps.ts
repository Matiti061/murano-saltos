import type { Attendance, JumpEvent } from '../db/types';

/** Clave de `blockJumps` para los saltos contados sin ejercicio activo. */
export const NO_BLOCK = '-';

export const blockKey = (blockId?: string) => blockId ?? NO_BLOCK;

/** Suma de los saltos ya compactados de una asistencia. */
export function compactedJumps(att: Pick<Attendance, 'blockJumps'>): number {
  return Object.values(att.blockJumps ?? {}).reduce((a, b) => a + b, 0);
}

/** Total de saltos: compactados + toques todavía sin compactar + ajuste manual. */
export function totalJumps(att: Pick<Attendance, 'blockJumps' | 'manualJumps'>, pendingEvents: number): number {
  return compactedJumps(att) + pendingEvents + (att.manualJumps ?? 0);
}

/** Cuenta toques por jugadora y por ejercicio. */
export function countEvents(events: Pick<JumpEvent, 'playerId' | 'blockId'>[]) {
  const byPlayer = new Map<string, Record<string, number>>();
  for (const e of events) {
    const rec = byPlayer.get(e.playerId) ?? {};
    const key = blockKey(e.blockId);
    rec[key] = (rec[key] ?? 0) + 1;
    byPlayer.set(e.playerId, rec);
  }
  return byPlayer;
}

/** Suma dos mapas de saltos por ejercicio. */
export function mergeBlockJumps(a: Record<string, number> | undefined, b: Record<string, number> | undefined) {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}
