import { average, wellnessScore, type LoadPoint } from '../lib/metrics';
import { buildReport, type SessionReportData } from '../lib/report';
import { loadRowsForPlayers, toLoadPoint } from './history';
import { db } from './schema';
import { isPresent } from './sessions';
import { getSettings } from './settings';
import type { Player } from './types';

export async function loadSessionReport(sessionId: string): Promise<SessionReportData | null> {
  const session = await db.sessions.get(sessionId);
  if (!session) return null;
  const [team, settings, attendance, blocks, events, complaints] = await Promise.all([
    db.teams.get(session.teamId),
    getSettings(),
    db.attendance.where('sessionId').equals(sessionId).toArray(),
    db.blocks.where('sessionId').equals(sessionId).toArray(),
    db.jumpEvents.where('sessionId').equals(sessionId).toArray(),
    db.complaints.where('sessionId').equals(sessionId).toArray(),
  ]);
  const playerIds = [...new Set([...attendance.map((a) => a.playerId), ...complaints.map((c) => c.playerId)])];
  const players = (await db.players.bulkGet(playerIds)).filter((p): p is Player => p != null);

  const rowsByPlayer = await loadRowsForPlayers(playerIds);
  const history = new Map<string, LoadPoint[]>();
  const wellnessAvg = new Map<string, number | null>();
  for (const [playerId, rows] of rowsByPlayer) {
    const upToHere = rows.filter(
      (r) =>
        isPresent(r.attendance.status) &&
        (r.session.date < session.date ||
          (r.session.date === session.date && r.session.startedAt <= session.startedAt)),
    );
    history.set(playerId, upToHere.map(toLoadPoint));
    const previous = upToHere
      .filter((r) => r.session.id !== sessionId)
      .map((r) => wellnessScore(r.attendance.wellness))
      .filter((v): v is number => v != null);
    wellnessAvg.set(playerId, previous.length >= 3 ? average(previous) : null);
  }

  return buildReport({
    session,
    team,
    settings,
    players,
    attendance,
    blocks,
    events,
    history,
    wellnessAvg,
    complaints,
    now: Date.now(),
  });
}
