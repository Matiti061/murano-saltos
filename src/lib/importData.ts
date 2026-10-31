import { db } from '../db/schema';
import {
  DEFAULT_SETTINGS,
  normalizeLegacyPlayer,
  type Attendance,
  type Block,
  type Complaint,
  type JumpEvent,
  type Player,
  type Session,
  type Settings,
  type Team,
} from '../db/types';
import { blockKey, countEvents, mergeBlockJumps, totalJumps } from './jumps';

type AnyId = string | number;
type Row<T> = Omit<T, 'id' | 'teamId' | 'playerId' | 'sessionId' | 'blockId'> & {
  id?: AnyId;
  teamId?: AnyId;
  playerId?: AnyId;
  sessionId?: AnyId;
  blockId?: AnyId;
};

/** Datos de cualquier origen (base antigua, copia de seguridad) con ids numéricos o de texto. */
export interface Dataset {
  teams: Row<Team>[];
  players: Row<Player>[];
  sessions: Row<Session>[];
  attendance: Row<Attendance>[];
  blocks: Row<Block>[];
  jumpEvents: Row<JumpEvent>[];
  complaints: Row<Complaint>[];
  settings: Partial<Settings>[];
}

export interface DatasetSummary {
  teams: number;
  players: number;
  sessions: number;
  complaints: number;
  teamNames: string[];
}

const k = (id: AnyId | undefined) => (id == null ? '' : String(id));

/** Quita los equipos de ejemplo y todo lo que cuelga de ellos. */
export function withoutDemo(ds: Dataset): Dataset {
  const demoTeams = new Set(ds.teams.filter((t) => t.demo).map((t) => k(t.id)));
  if (demoTeams.size === 0) return ds;
  const players = ds.players.filter((p) => !demoTeams.has(k(p.teamId)));
  const sessions = ds.sessions.filter((s) => !demoTeams.has(k(s.teamId)));
  const playerIds = new Set(players.map((p) => k(p.id)));
  const sessionIds = new Set(sessions.map((s) => k(s.id)));
  return {
    teams: ds.teams.filter((t) => !t.demo),
    players,
    sessions,
    attendance: ds.attendance.filter((a) => sessionIds.has(k(a.sessionId))),
    blocks: ds.blocks.filter((b) => sessionIds.has(k(b.sessionId))),
    jumpEvents: ds.jumpEvents.filter((e) => sessionIds.has(k(e.sessionId))),
    complaints: ds.complaints.filter((c) => playerIds.has(k(c.playerId))),
    settings: ds.settings,
  };
}

export function summarize(ds: Dataset): DatasetSummary {
  return {
    teams: ds.teams.length,
    players: ds.players.length,
    sessions: ds.sessions.length,
    complaints: ds.complaints.length,
    teamNames: ds.teams.map((t) => t.name),
  };
}

export function isEmptyDataset(ds: Dataset) {
  return ds.teams.length === 0 && ds.players.length === 0 && ds.sessions.length === 0;
}

/**
 * Añade un conjunto de datos a la base de la nube con ids nuevos, manteniendo todas las relaciones.
 * Los toques de sesiones finalizadas se compactan por ejercicio para ocupar poco espacio.
 */
export async function importDataset(ds: Dataset): Promise<DatasetSummary> {
  const strip = <T extends { id?: AnyId }>(r: T) => {
    const { id: _id, ...rest } = r;
    return rest;
  };

  await db.transaction(
    'rw',
    [db.teams, db.players, db.sessions, db.attendance, db.blocks, db.jumpEvents, db.complaints, db.settings],
    async () => {
      const teamKeys = (await db.teams.bulkAdd(ds.teams.map((t) => strip(t) as Team), { allKeys: true })) as string[];
      const teamMap = new Map(ds.teams.map((t, i) => [k(t.id), teamKeys[i]]));

      const players = ds.players.filter((p) => teamMap.has(k(p.teamId)));
      const playerKeys = (await db.players.bulkAdd(
        players.map((p) => normalizeLegacyPlayer({ ...strip(p), teamId: teamMap.get(k(p.teamId))! } as Player)),
        { allKeys: true },
      )) as string[];
      const playerMap = new Map(players.map((p, i) => [k(p.id), playerKeys[i]]));

      const sessions = ds.sessions.filter((s) => teamMap.has(k(s.teamId)));
      const sessionKeys = (await db.sessions.bulkAdd(
        sessions.map((s) => ({ ...strip(s), teamId: teamMap.get(k(s.teamId))! }) as Session),
        { allKeys: true },
      )) as string[];
      const sessionMap = new Map(sessions.map((s, i) => [k(s.id), sessionKeys[i]]));
      const finished = new Set(sessions.filter((s) => s.status === 'finalizado').map((s) => k(s.id)));

      const blocks = ds.blocks.filter((b) => sessionMap.has(k(b.sessionId)));
      const blockKeys = (await db.blocks.bulkAdd(
        blocks.map((b) => ({ ...strip(b), sessionId: sessionMap.get(k(b.sessionId))! }) as Block),
        { allKeys: true },
      )) as string[];
      const blockMap = new Map(blocks.map((b, i) => [k(b.id), blockKeys[i]]));
      const newBlockKey = (old: AnyId | undefined) => blockKey(old == null ? undefined : blockMap.get(k(old)));

      // Toques: los de sesiones finalizadas se compactan; los de sesiones en curso se copian tal cual.
      const events = ds.jumpEvents.filter((e) => sessionMap.has(k(e.sessionId)) && playerMap.has(k(e.playerId)));
      const toCompact = new Map<string, Row<JumpEvent>[]>();
      const toCopy: JumpEvent[] = [];
      for (const e of events) {
        if (finished.has(k(e.sessionId))) {
          const list = toCompact.get(k(e.sessionId)) ?? [];
          list.push(e);
          toCompact.set(k(e.sessionId), list);
        } else {
          const blockId = e.blockId == null ? undefined : blockMap.get(k(e.blockId));
          toCopy.push({
            sessionId: sessionMap.get(k(e.sessionId))!,
            playerId: playerMap.get(k(e.playerId))!,
            ts: e.ts,
            ...(blockId ? { blockId } : {}),
          });
        }
      }
      if (toCopy.length) await db.jumpEvents.bulkAdd(toCopy);

      const pendingCount = new Map<string, number>();
      for (const e of toCopy) pendingCount.set(`${e.sessionId}|${e.playerId}`, (pendingCount.get(`${e.sessionId}|${e.playerId}`) ?? 0) + 1);

      const attendance = ds.attendance.filter((a) => sessionMap.has(k(a.sessionId)) && playerMap.has(k(a.playerId)));
      await db.attendance.bulkAdd(
        attendance.map((a) => {
          const sessionId = sessionMap.get(k(a.sessionId))!;
          const playerId = playerMap.get(k(a.playerId))!;
          // Claves de ejercicios ya compactados (copias v3) con los ids nuevos.
          const remapped: Record<string, number> = {};
          for (const [key, n] of Object.entries(a.blockJumps ?? {})) {
            const nk = key === blockKey(undefined) ? key : newBlockKey(key);
            remapped[nk] = (remapped[nk] ?? 0) + n;
          }
          const sessionEvents = toCompact.get(k(a.sessionId))?.filter((e) => k(e.playerId) === k(a.playerId)) ?? [];
          const fromEvents: Record<string, number> = {};
          for (const [, rec] of countEvents(sessionEvents.map((e) => ({ playerId: k(e.playerId), blockId: e.blockId == null ? undefined : k(e.blockId) })))) {
            for (const [oldKey, n] of Object.entries(rec)) {
              const nk = oldKey === blockKey(undefined) ? oldKey : newBlockKey(oldKey);
              fromEvents[nk] = (fromEvents[nk] ?? 0) + n;
            }
          }
          const blockJumps = mergeBlockJumps(remapped, fromEvents);
          const att: Attendance = { ...(strip(a) as Attendance), sessionId, playerId, manualJumps: a.manualJumps ?? 0, blockJumps };
          att.jumps = totalJumps(att, pendingCount.get(`${sessionId}|${playerId}`) ?? 0);
          return att;
        }),
      );

      const complaints = ds.complaints.filter((c) => playerMap.has(k(c.playerId)));
      await db.complaints.bulkAdd(
        complaints.map((c) => {
          const sessionId = c.sessionId == null ? undefined : sessionMap.get(k(c.sessionId));
          const { sessionId: _s, ...rest } = strip(c);
          return { ...rest, playerId: playerMap.get(k(c.playerId))!, ...(sessionId ? { sessionId } : {}) } as Complaint;
        }),
      );

      // Ajustes: solo si la nube todavía no tiene (no se pisan los de otro dispositivo).
      const incoming = ds.settings[0];
      if (incoming && (await db.settings.count()) === 0) {
        await db.settings.add({ ...DEFAULT_SETTINGS, ...strip(incoming) } as Settings);
      }
    },
  );

  return summarize(ds);
}
