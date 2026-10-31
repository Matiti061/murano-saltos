import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { DEFAULT_SETTINGS, type Settings } from './types';

/** Hay una sola fila de ajustes por club; si dos dispositivos crean una a la vez, se usa siempre la misma (la de id menor). */
async function settingsRow() {
  return db.settings.orderBy(':id').first();
}

export async function getSettings(): Promise<Settings> {
  const s = await settingsRow();
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function updateSettings(changes: Partial<Omit<Settings, 'id'>>) {
  await db.transaction('rw', db.settings, async () => {
    const row = await settingsRow();
    if (row) await db.settings.update(row.id!, changes);
    else await db.settings.add({ ...DEFAULT_SETTINGS, ...changes });
  });
}

/** Ajustes reactivos; devuelve los valores por defecto mientras carga. */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
}
