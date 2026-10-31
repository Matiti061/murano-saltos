import Dexie from 'dexie';
import { normalizeLegacyPlayer } from './types';
import type { Dataset } from '../lib/importData';

/**
 * Base local de las versiones anteriores (antes de la nube). Solo se lee para subir sus datos;
 * nunca se borra, así queda como respaldo en cada dispositivo.
 */
const LEGACY_NAME = 'murano-saltos';
const IMPORT_MARK = 'cloudImport';

const STORES = {
  teams: '++id, name',
  players: '++id, teamId, archived',
  sessions: '++id, teamId, date, status, [teamId+date]',
  attendance: '++id, sessionId, playerId, &[sessionId+playerId]',
  blocks: '++id, sessionId',
  jumpEvents: '++id, sessionId, playerId, blockId, [sessionId+playerId]',
  complaints: '++id, playerId, sessionId, date',
  settings: 'id',
};

function openLegacy() {
  const legacy = new Dexie(LEGACY_NAME);
  legacy.version(1).stores(STORES);
  // Mismo paso que hacía la v2 de la app, por si el dispositivo nunca la abrió.
  legacy
    .version(2)
    .stores(STORES)
    .upgrade((tx) =>
      tx
        .table('players')
        .toCollection()
        .modify((p) => {
          normalizeLegacyPlayer(p);
        }),
    );
  return legacy;
}

export interface LegacyInfo {
  data: Dataset;
  importedAt?: number;
}

/** Datos de la versión anterior en este dispositivo, o null si no hay. */
export async function readLegacyData(): Promise<LegacyInfo | null> {
  if (!(await Dexie.exists(LEGACY_NAME))) return null;
  const legacy = openLegacy();
  try {
    const [teams, players, sessions, attendance, blocks, jumpEvents, complaints, settings] = await Promise.all([
      legacy.table('teams').toArray(),
      legacy.table('players').toArray(),
      legacy.table('sessions').toArray(),
      legacy.table('attendance').toArray(),
      legacy.table('blocks').toArray(),
      legacy.table('jumpEvents').toArray(),
      legacy.table('complaints').toArray(),
      legacy.table('settings').toArray(),
    ]);
    const mark = settings.find((s) => s.id === IMPORT_MARK);
    return {
      data: {
        teams,
        players,
        sessions,
        attendance,
        blocks,
        jumpEvents,
        complaints,
        settings: settings.filter((s) => s.id !== IMPORT_MARK),
      },
      importedAt: mark?.at,
    };
  } finally {
    legacy.close();
  }
}

/** Deja constancia en la base antigua de que ya se subió (o se descartó), para no volver a preguntar. */
export async function markLegacyHandled(action: 'imported' | 'skipped') {
  if (!(await Dexie.exists(LEGACY_NAME))) return;
  const legacy = openLegacy();
  try {
    await legacy.table('settings').put({ id: IMPORT_MARK, at: Date.now(), action });
  } finally {
    legacy.close();
  }
}
