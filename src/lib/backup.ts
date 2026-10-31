import { ALL_TABLES, db, type TableName } from '../db/schema';
import { updateSettings } from '../db/settings';
import { ATTENDANCE_LABEL, SESSION_TYPE_LABEL, type JumpEvent } from '../db/types';
import { toCsv, type CsvCell } from './csv';
import { downloadText } from './download';
import { todayISO } from './format';
import { importDataset, summarize, type Dataset, type DatasetSummary } from './importData';
import { sessionRpeLoad, wellnessTotal } from './metrics';

const BACKUP_APP = 'murano-saltos';
/**
 * v1: ids numéricos. v2: toques como tuplas. v3: datos de la nube (ids de texto, saltos compactados).
 * Todas se pueden importar.
 */
const BACKUP_VERSION = 3;

type AnyId = string | number;
type EventTuple = [id: AnyId, sessionId: AnyId, playerId: AnyId, blockId: AnyId | null, ts: number];

interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

const packEvents = (rows: JumpEvent[]): EventTuple[] =>
  rows.map((e) => [e.id!, e.sessionId, e.playerId, e.blockId ?? null, e.ts]);

const unpackEvents = (rows: EventTuple[]) =>
  rows.map(([id, sessionId, playerId, blockId, ts]) => ({ id, sessionId, playerId, ts, ...(blockId != null ? { blockId } : {}) }));

export async function buildBackupJson(): Promise<string> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) data[t] = await db.table(t).toArray();
  });
  data.jumpEvents = packEvents(data.jumpEvents as JumpEvent[]);
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  return JSON.stringify(file);
}

export async function exportBackup() {
  downloadText(await buildBackupJson(), `murano-copia-${todayISO()}.json`, 'application/json');
  await updateSettings({ lastBackupAt: Date.now() });
}

export interface ParsedBackup {
  exportedAt: string;
  dataset: Dataset;
  summary: DatasetSummary;
}

/** Valida el archivo y lo deja listo para importar (con resumen para pedir confirmación). */
export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const file = parsed as BackupFile;
  if (!file || file.app !== BACKUP_APP || typeof file.data !== 'object') {
    throw new Error('El archivo no es una copia de seguridad de esta app.');
  }
  if (file.version > BACKUP_VERSION) {
    throw new Error('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  }
  for (const t of ALL_TABLES) {
    if (!Array.isArray(file.data[t] ?? [])) throw new Error(`Datos dañados en «${t}».`);
  }
  const rows = (t: TableName) => (file.data[t] ?? []) as never[];
  const dataset: Dataset = {
    teams: rows('teams'),
    players: rows('players'),
    sessions: rows('sessions'),
    attendance: rows('attendance'),
    blocks: rows('blocks'),
    jumpEvents: file.version >= 2 ? (unpackEvents(rows('jumpEvents') as EventTuple[]) as never[]) : rows('jumpEvents'),
    complaints: rows('complaints'),
    settings: rows('settings'),
  };
  return { exportedAt: file.exportedAt, dataset, summary: summarize(dataset) };
}

/**
 * Sustituye TODOS los datos (también en la nube y en los demás dispositivos) por los de la copia.
 * Los ids se regeneran, así que sirve para copias de cualquier versión.
 */
export async function restoreBackup(backup: ParsedBackup) {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
  await importDataset(backup.dataset);
}

/** Una fila por jugadora y sesión, con todas las cargas. */
export async function exportLoadsCsv() {
  const [teams, players, sessions, attendance] = await Promise.all([
    db.teams.toArray(),
    db.players.toArray(),
    db.sessions.toArray(),
    db.attendance.toArray(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id!, t]));
  const playerById = new Map(players.map((p) => [p.id!, p]));
  const sessionById = new Map(sessions.map((s) => [s.id!, s]));
  const rows: CsvCell[][] = attendance
    .map((a) => ({ a, s: sessionById.get(a.sessionId), p: playerById.get(a.playerId) }))
    .filter((r) => r.s && r.p)
    .sort((x, y) => x.s!.date.localeCompare(y.s!.date) || x.s!.startedAt - y.s!.startedAt)
    .map(({ a, s, p }) => [
      s!.date,
      teamById.get(s!.teamId)?.name,
      SESSION_TYPE_LABEL[s!.type],
      s!.durationMin,
      p!.name,
      p!.position,
      ATTENDANCE_LABEL[a.status],
      a.jumps,
      a.jumpLimit ?? p!.jumpLimit,
      a.minutes,
      a.rpe,
      sessionRpeLoad(a.rpe, a.minutes),
      a.wellness?.sleep,
      a.wellness?.fatigue,
      a.wellness?.soreness,
      a.wellness?.stress,
      wellnessTotal(a.wellness),
    ]);
  const head: CsvCell[] = [
    'Fecha',
    'Equipo',
    'Tipo',
    'Duración sesión (min)',
    'Jugadora',
    'Posición',
    'Asistencia',
    'Saltos',
    'Límite',
    'Minutos',
    'RPE',
    'sRPE',
    'Sueño',
    'Fatiga',
    'Dolor muscular',
    'Estrés',
    'Wellness total',
  ];
  downloadText(toCsv([head, ...rows]), `murano-cargas-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}

export async function exportComplaintsCsv() {
  const [players, complaints, teams] = await Promise.all([
    db.players.toArray(),
    db.complaints.toArray(),
    db.teams.toArray(),
  ]);
  const playerById = new Map(players.map((p) => [p.id!, p]));
  const teamById = new Map(teams.map((t) => [t.id!, t]));
  const rows: CsvCell[][] = complaints
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => {
      const p = playerById.get(c.playerId);
      return [
        c.date,
        p ? teamById.get(p.teamId)?.name : '',
        p?.name,
        c.kind === 'lesion' ? 'Lesión' : 'Molestia',
        c.zone,
        c.side,
        c.intensity,
        c.description,
        c.physioNotes,
        c.resolvedDate ?? 'Activa',
      ];
    });
  const head: CsvCell[] = [
    'Fecha',
    'Equipo',
    'Jugadora',
    'Tipo',
    'Zona',
    'Lado',
    'Intensidad (0-10)',
    'Descripción',
    'Notas fisio',
    'Alta',
  ];
  downloadText(toCsv([head, ...rows]), `murano-molestias-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
