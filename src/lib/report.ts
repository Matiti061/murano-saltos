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
import { countEvents, mergeBlockJumps, totalJumps } from './jumps';

export interface ReportRaw {
  session: Session;
  team?: Team;
  settings: Settings;
  players: Player[];
  attendance: Attendance[];
  blocks: Block[];
  /** Toques todavía sin compactar (solo en sesiones en curso). */
  events: Pick<JumpEvent, 'playerId' | 'blockId'>[];
  /** Carga histórica de cada jugadora hasta esta sesión incluida. */
  history: Map<string, LoadPoint[]>;
  /** Media personal de wellness sin contar esta sesión. */
  wellnessAvg: Map<string, number | null>;
  complaints: Complaint[];
  now: number;
}

export interface ReportPlayerRow {
  player: Player;
  attendance: Attendance;
  jumps: number;
  /** Saltos por id de ejercicio. */
  perBlock: Record<string, number>;
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

  // Saltos por ejercicio = compactados (blockJumps) + toques pendientes.
  const pendingByPlayer = countEvents(raw.events);
  const blockIds = new Set(raw.blocks.map((b) => b.id!));
  const perBlockOf = (att: Attendance) => mergeBlockJumps(att.blockJumps, pendingByPlayer.get(att.playerId));

  const rows: ReportPlayerRow[] = [];
  const absent: SessionReportData['absent'] = [];
  for (const att of raw.attendance) {
    const player = playersById.get(att.playerId);
    if (!player) continue;
    if (!isPresent(att.status)) {
      absent.push({ player, status: att.status });
      continue;
    }
    const all = perBlockOf(att);
    const perBlock: Record<string, number> = {};
    for (const [key, n] of Object.entries(all)) if (blockIds.has(key)) perBlock[key] = n;
    const inBlocks = Object.values(perBlock).reduce((a, b) => a + b, 0);
    const pending = Object.values(pendingByPlayer.get(att.playerId) ?? {}).reduce((a, b) => a + b, 0);
    const jumps = totalJumps(att, pending);
    const limit = att.jumpLimit ?? player.jumpLimit;
    const points = raw.history.get(att.playerId) ?? [];
    const wTotal = wellnessTotal(att.wellness);
    rows.push({
      player,
      attendance: att,
      jumps,
      perBlock,
      noBlock: jumps - inBlocks,
      limit,
      limitPct: limit ? Math.round((jumps / limit) * 100) : undefined,
      limitState: limitState(jumps, limit, settings.limitWarnPct),
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

  const blockJumps = new Map<string, number>();
  for (const att of raw.attendance) {
    if (!isPresent(att.status)) continue;
    for (const [key, n] of Object.entries(perBlockOf(att))) blockJumps.set(key, (blockJumps.get(key) ?? 0) + n);
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

  const teamJumps = rows.reduce((a, r) => a + r.jumps, 0);
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
      jumps: teamJumps,
      avg: rows.length ? teamJumps / rows.length : null,
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
