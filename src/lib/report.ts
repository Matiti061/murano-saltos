import { complaintLabel } from '../db/complaints';
import { isPresent } from '../db/sessions';
import {
  comparePlayers,
  type Attendance,
  type AttendanceStatus,
  type Block,
  type Complaint,
  type JumpEvent,
  type Player,
  type Session,
  type Settings,
  type Team,
} from '../db/types';
import {
  computeAcwr,
  limitState,
  sessionRpeLoad,
  wellnessDropsBelowAverage,
  wellnessLowItems,
  wellnessTotal,
  type AcwrResult,
  type LimitState,
  type LoadPoint,
} from './metrics';

export interface ReportRaw {
  session: Session;
  team?: Team;
  settings: Settings;
  players: Player[];
  attendance: Attendance[];
  blocks: Block[];
  events: Pick<JumpEvent, 'playerId' | 'blockId'>[];
  /** Carga histórica de cada jugadora hasta esta sesión incluida. */
  history: Map<number, LoadPoint[]>;
  /** Media personal de wellness sin contar esta sesión. */
  wellnessAvg: Map<number, number | null>;
  complaints: Complaint[];
  now: number;
}

export interface ReportPlayerRow {
  player: Player;
  attendance: Attendance;
  jumps: number;
  perBlock: Record<number, number>;
  /** Saltos fuera de ejercicio o añadidos a mano. */
  noBlock: number;
  limit?: number;
  limitPct?: number;
  limitState: LimitState;
  minutes?: number;
  rpe?: number;
  srpe: number | null;
  wellnessTotal: number | null;
  wellnessLow: string[];
  wellnessDrop: boolean;
  acwrJumps: AcwrResult;
  acwrSrpe: AcwrResult;
}

export interface ReportBlockRow {
  block: Block;
  durationMin: number | null;
  jumps: number;
  perMin: number | null;
}

export type AlertLevel = 'alta' | 'media';
export interface ReportAlert {
  level: AlertLevel;
  text: string;
}

export interface SessionReportData {
  session: Session;
  team?: Team;
  settings: Settings;
  rows: ReportPlayerRow[];
  absent: { player: Player; status: AttendanceStatus }[];
  blocks: ReportBlockRow[];
  showNoBlock: boolean;
  totals: {
    jumps: number;
    avg: number | null;
    max: { name: string; jumps: number } | null;
    present: number;
    convened: number;
  };
  complaints: { complaint: Complaint; player?: Player }[];
  alerts: ReportAlert[];
}

export const playerLabel = (p: Player) => p.name;

export function buildReport(raw: ReportRaw): SessionReportData {
  const { session, settings } = raw;
  const playersById = new Map(raw.players.map((p) => [p.id!, p]));

  const perPlayerBlock = new Map<number, Record<number, number>>();
  for (const e of raw.events) {
    if (e.blockId == null) continue;
    const rec = perPlayerBlock.get(e.playerId) ?? {};
    rec[e.blockId] = (rec[e.blockId] ?? 0) + 1;
    perPlayerBlock.set(e.playerId, rec);
  }

  const rows: ReportPlayerRow[] = [];
  const absent: SessionReportData['absent'] = [];
  for (const att of raw.attendance) {
    const player = playersById.get(att.playerId);
    if (!player) continue;
    if (!isPresent(att.status)) {
      absent.push({ player, status: att.status });
      continue;
    }
    const perBlock = perPlayerBlock.get(att.playerId) ?? {};
    const inBlocks = Object.values(perBlock).reduce((a, b) => a + b, 0);
    const limit = att.jumpLimit ?? player.jumpLimit;
    const points = raw.history.get(att.playerId) ?? [];
    const wTotal = wellnessTotal(att.wellness);
    rows.push({
      player,
      attendance: att,
      jumps: att.jumps,
      perBlock,
      noBlock: att.jumps - inBlocks,
      limit,
      limitPct: limit ? Math.round((att.jumps / limit) * 100) : undefined,
      limitState: limitState(att.jumps, limit, settings.limitWarnPct),
      minutes: att.minutes,
      rpe: att.rpe,
      srpe: sessionRpeLoad(att.rpe, att.minutes),
      wellnessTotal: wTotal,
      wellnessLow: wellnessLowItems(att.wellness, settings.wellnessItemAlert),
      wellnessDrop: wellnessDropsBelowAverage(wTotal, raw.wellnessAvg.get(att.playerId) ?? null),
      acwrJumps: computeAcwr(points, session.date, 'jumps', settings),
      acwrSrpe: computeAcwr(points, session.date, 'srpe', settings),
    });
  }
  const byPosition = (a: { player: Player }, b: { player: Player }) => comparePlayers(a.player, b.player);
  rows.sort(byPosition);
  absent.sort(byPosition);

  const blockJumps = new Map<number, number>();
  for (const e of raw.events) {
    if (e.blockId != null) blockJumps.set(e.blockId, (blockJumps.get(e.blockId) ?? 0) + 1);
  }
  const blocks: ReportBlockRow[] = [...raw.blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => {
      const end = block.endedAt ?? (session.status === 'en_curso' ? raw.now : undefined);
      const durationMin = end != null ? (end - block.startedAt) / 60_000 : null;
      const jumps = blockJumps.get(block.id!) ?? 0;
      return {
        block,
        durationMin,
        jumps,
        perMin: durationMin && durationMin > 0.5 ? jumps / durationMin : null,
      };
    });

  const totalJumps = rows.reduce((a, r) => a + r.jumps, 0);
  const top = rows.reduce<ReportPlayerRow | null>((best, r) => (!best || r.jumps > best.jumps ? r : best), null);

  const complaints = raw.complaints.map((complaint) => ({
    complaint,
    player: playersById.get(complaint.playerId),
  }));

  return {
    session,
    team: raw.team,
    settings,
    rows,
    absent,
    blocks,
    showNoBlock: raw.blocks.length > 0 && rows.some((r) => r.noBlock !== 0),
    totals: {
      jumps: totalJumps,
      avg: rows.length ? totalJumps / rows.length : null,
      max: top && top.jumps > 0 ? { name: playerLabel(top.player), jumps: top.jumps } : null,
      present: rows.length,
      convened: rows.length + absent.length,
    },
    complaints,
    alerts: buildAlerts(rows, complaints),
  };
}

function fmtRatio(r: number | null) {
  return r == null ? '' : r.toFixed(2).replace('.', ',');
}

function buildAlerts(rows: ReportPlayerRow[], complaints: SessionReportData['complaints']): ReportAlert[] {
  const alerts: ReportAlert[] = [];
  for (const r of rows) {
    const name = playerLabel(r.player);
    if (r.limitState === 'over') {
      alerts.push({
        level: 'alta',
        text: `${name} ha alcanzado su límite de saltos: ${r.jumps}/${r.limit} (${r.limitPct}%).`,
      });
    }
    for (const [label, acwr] of [
      ['saltos', r.acwrJumps],
      ['carga interna (sRPE)', r.acwrSrpe],
    ] as const) {
      if (acwr.status === 'muy_alto') {
        alerts.push({ level: 'alta', text: `${name}: pico alto de ${label}, ACWR ${fmtRatio(acwr.ratio)}.` });
      } else if (acwr.status === 'alto') {
        alerts.push({ level: 'media', text: `${name}: pico de ${label}, ACWR ${fmtRatio(acwr.ratio)}.` });
      }
    }
    if (r.wellnessLow.length > 0) {
      alerts.push({ level: 'media', text: `${name}: wellness bajo en ${r.wellnessLow.join(', ').toLowerCase()}.` });
    } else if (r.wellnessDrop) {
      alerts.push({ level: 'media', text: `${name}: wellness claramente por debajo de su media.` });
    }
    if (r.player.status === 'readaptacion') {
      alerts.push({ level: 'media', text: `${name} está en readaptación.` });
    }
  }
  for (const { complaint, player } of complaints) {
    const who = player ? playerLabel(player) : 'Jugadora';
    alerts.push({
      level: complaint.kind === 'lesion' || complaint.intensity >= 7 ? 'alta' : 'media',
      text: `${who}: ${complaint.kind === 'lesion' ? 'lesión' : 'molestia'} en ${complaintLabel(complaint).toLowerCase()}.`,
    });
  }
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alta' ? -1 : 1));
}
