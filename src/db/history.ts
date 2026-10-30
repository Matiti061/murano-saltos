import { sessionRpeLoad, type LoadPoint } from '../lib/metrics';
import { db } from './schema';
import { isPresent } from './sessions';
import type { Attendance, Session } from './types';

export interface PlayerSessionRow {
  session: Session;
  attendance: Attendance;
}

export function toLoadPoint(row: PlayerSessionRow): LoadPoint {
  return {
    date: row.session.date,
    jumps: row.attendance.jumps,
    srpe: sessionRpeLoad(row.attendance.rpe, row.attendance.minutes),
  };
}

/** Todas las sesiones en las que participó una jugadora, ordenadas por fecha. */
export async function loadPlayerRows(playerId: number): Promise<PlayerSessionRow[]> {
  const atts = await db.attendance.where('playerId').equals(playerId).toArray();
  const sessions = await db.sessions.bulkGet(atts.map((a) => a.sessionId));
  return atts
    .map((attendance, i) => ({ attendance, session: sessions[i] }))
    .filter((r): r is PlayerSessionRow => r.session != null)
    .sort((a, b) => a.session.date.localeCompare(b.session.date) || a.session.startedAt - b.session.startedAt);
}

/** Puntos de carga (solo sesiones en las que estuvo presente). */
export function loadPointsFrom(rows: PlayerSessionRow[]): LoadPoint[] {
  return rows.filter((r) => isPresent(r.attendance.status)).map(toLoadPoint);
}

/** Filas de todas las jugadoras de un conjunto de ids, agrupadas por jugadora. */
export async function loadRowsForPlayers(playerIds: number[]): Promise<Map<number, PlayerSessionRow[]>> {
  const atts = await db.attendance.where('playerId').anyOf(playerIds).toArray();
  const sessionIds = [...new Set(atts.map((a) => a.sessionId))];
  const sessions = await db.sessions.bulkGet(sessionIds);
  const byId = new Map(sessions.filter(Boolean).map((s) => [s!.id!, s!]));
  const out = new Map<number, PlayerSessionRow[]>(playerIds.map((id) => [id, []]));
  for (const attendance of atts) {
    const session = byId.get(attendance.sessionId);
    if (session) out.get(attendance.playerId)?.push({ session, attendance });
  }
  for (const rows of out.values()) {
    rows.sort((a, b) => a.session.date.localeCompare(b.session.date) || a.session.startedAt - b.session.startedAt);
  }
  return out;
}
