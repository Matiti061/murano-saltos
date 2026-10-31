import Dexie, { type EntityTable } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import type { Attendance, Block, Complaint, JumpEvent, Player, Session, Settings, Team } from './types';

/** Base de datos en Dexie Cloud (no es secreta: el acceso se controla con el inicio de sesión). */
export const DEXIE_CLOUD_URL = 'https://zyeafs1bj.dexie.cloud';

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

/**
 * Base sincronizada con la nube. Los ids «@» se generan únicos en todos los dispositivos.
 * La base local anterior («murano-saltos») se conserva intacta: ver legacy.ts.
 */
export const db = new Dexie('murano-nube', { addons: [dexieCloud] }) as MuranoDB;

db.version(1).stores({
  teams: '@id, name',
  players: '@id, teamId, archived',
  sessions: '@id, teamId, date, status, [teamId+date]',
  attendance: '@id, sessionId, playerId, [sessionId+playerId]',
  blocks: '@id, sessionId',
  jumpEvents: '@id, sessionId, playerId, blockId, [sessionId+playerId]',
  complaints: '@id, playerId, sessionId, date',
  settings: '@id',
});

db.cloud.configure({
  databaseUrl: DEXIE_CLOUD_URL,
  requireAuth: true,
  customLoginGui: true,
  socialAuth: false,
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
