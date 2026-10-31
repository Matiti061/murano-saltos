import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { isActiveComplaint } from '../db/complaints';
import { loadPointsFrom, loadRowsForPlayers, type PlayerSessionRow } from '../db/history';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { getSettings } from '../db/settings';
import type { Complaint, Player } from '../db/types';
import { todayISO } from '../lib/format';
import {
  average,
  computeAcwr,
  wellnessDropsBelowAverage,
  wellnessLowItems,
  wellnessTotal,
  type AcwrResult,
  type LoadPoint,
} from '../lib/metrics';

export interface PlayerLoadSummary {
  player: Player;
  rows: PlayerSessionRow[];
  points: LoadPoint[];
  acwrJumps: AcwrResult;
  acwrSrpe: AcwrResult;
  jumps7d: number;
  srpe7d: number;
  /** Último wellness registrado en los últimos 3 días. */
  recentWellness?: { date: string; total: number; low: string[]; drop: boolean };
  activeComplaints: Complaint[];
}

export async function loadTeamSummary(teamId: string, includeArchived = false): Promise<PlayerLoadSummary[]> {
  const settings = await getSettings();
  const all = await db.players.where('teamId').equals(teamId).toArray();
  const players = sortPlayers(all.filter((p) => includeArchived || !p.archived));
  const ids = players.map((p) => p.id!);
  const [rowsBy, complaints] = await Promise.all([
    loadRowsForPlayers(ids),
    db.complaints.where('playerId').anyOf(ids).toArray(),
  ]);
  const today = todayISO();

  return players.map((player) => {
    const rows = rowsBy.get(player.id!) ?? [];
    const points = loadPointsFrom(rows);
    const acwrJumps = computeAcwr(points, today, 'jumps', settings);
    const acwrSrpe = computeAcwr(points, today, 'srpe', settings);

    const withWellness = rows.filter((r) => r.attendance.wellness);
    const last = withWellness[withWellness.length - 1];
    let recentWellness: PlayerLoadSummary['recentWellness'];
    if (last && differenceInCalendarDays(parseISO(today), parseISO(last.session.date)) <= 3) {
      const total = wellnessTotal(last.attendance.wellness)!;
      const previous = withWellness.slice(0, -1).map((r) => wellnessTotal(r.attendance.wellness)!);
      recentWellness = {
        date: last.session.date,
        total,
        low: wellnessLowItems(last.attendance.wellness, settings.wellnessItemAlert),
        drop: wellnessDropsBelowAverage(total, previous.length >= 3 ? average(previous) : null),
      };
    }

    return {
      player,
      rows,
      points,
      acwrJumps,
      acwrSrpe,
      jumps7d: acwrJumps.acute,
      srpe7d: acwrSrpe.acute,
      recentWellness,
      activeComplaints: complaints.filter((c) => c.playerId === player.id && isActiveComplaint(c)),
    };
  });
}

export function useTeamLoad(teamId: string | undefined, includeArchived = false) {
  return useLiveQuery(
    () => (teamId == null ? Promise.resolve([] as PlayerLoadSummary[]) : loadTeamSummary(teamId, includeArchived)),
    [teamId, includeArchived],
  );
}
