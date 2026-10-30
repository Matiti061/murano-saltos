import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { DEFAULT_SETTINGS, type Settings } from './types';

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('main');
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function updateSettings(changes: Partial<Omit<Settings, 'id'>>) {
  const current = await getSettings();
  await db.settings.put({ ...current, ...changes, id: 'main' });
}

/** Ajustes reactivos; devuelve los valores por defecto mientras carga. */
export function useSettings(): Settings {
  return useLiveQuery(getSettings, []) ?? DEFAULT_SETTINGS;
}
