import Dexie, { type EntityTable } from 'dexie';
import type {
  Attendance,
  Block,
  Complaint,
  JumpEvent,
  Player,
  Session,
  Settings,
  Team,
} from './types';

export type MuranoDB = Dexie & {
  teams: EntityTable<Team, 'id'>;
  players: EntityTable<Player, 'id'>;
  sessions: EntityTable<Session, 'id'>;
  attendance: EntityTable<Attendance, 'id'>;
  blocks: EntityTable<Block, 'id'>;
  jumpEvents: EntityTable<JumpEvent, 'id'>;
  complaints: EntityTable<Complaint, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

export const db = new Dexie('murano-saltos') as MuranoDB;

db.version(1).stores({
  teams: '++id, name',
  players: '++id, teamId, archived',
  sessions: '++id, teamId, date, status, [teamId+date]',
  attendance: '++id, sessionId, playerId, &[sessionId+playerId]',
  blocks: '++id, sessionId',
  jumpEvents: '++id, sessionId, playerId, blockId, [sessionId+playerId]',
  complaints: '++id, playerId, sessionId, date',
  settings: 'id',
});

export const ALL_TABLES = [
  'teams',
  'players',
  'sessions',
  'attendance',
  'blocks',
  'jumpEvents',
  'complaints',
  'settings',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}
