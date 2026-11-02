import { hasCompleteWellness } from '../lib/forms/parse';
import { normalize } from '../lib/forms/text';
import { DISCOMFORT_INTENSITY, DISCOMFORT_LABEL, zoneFromText } from '../lib/forms/zones';
import { db } from './schema';
import type { Attendance, FormKind, FormResponse, FormValues, Session } from './types';

export interface ImportItem {
  playerId: string;
  submittedAt: number;
  date: string;
  values: FormValues;
  raw: Record<string, string>;
}

export interface ImportResult {
  added: number;
  duplicates: number;
  applied: number;
  pending: number;
  /** Respuestas con sesión pero sin la jugadora en la asistencia. */
  withoutAttendance: number;
  dates: string[];
}

const responseKey = (playerId: string, kind: FormKind, submittedAt: number) => `${playerId}|${kind}|${submittedAt}`;

/** Claves de las respuestas ya importadas, para no duplicar al subir la hoja completa otra vez. */
export async function existingResponseKeys(teamId: string): Promise<Set<string>> {
  const all = await db.formResponses.where('teamId').equals(teamId).toArray();
  return new Set(all.map((r) => responseKey(r.playerId, r.kind, r.submittedAt)));
}

export const isDuplicate = (keys: Set<string>, item: Pick<ImportItem, 'playerId' | 'submittedAt'>, kind: FormKind) =>
  keys.has(responseKey(item.playerId, kind, item.submittedAt));

/**
 * Guarda las respuestas nuevas (las repetidas se ignoran), aprende los alias de nombres
 * y las aplica a los entrenamientos de esas fechas.
 */
export async function importFormResponses(
  teamId: string,
  kind: FormKind,
  items: ImportItem[],
  aliases: { playerId: string; alias: string }[] = [],
): Promise<ImportResult> {
  const now = Date.now();
  let added = 0;
  const dates = new Set<string>();
  await db.transaction('rw', [db.formResponses, db.players], async () => {
    const keys = await existingResponseKeys(teamId);
    const fresh: FormResponse[] = [];
    for (const item of items) {
      const key = responseKey(item.playerId, kind, item.submittedAt);
      if (keys.has(key)) continue;
      keys.add(key);
      fresh.push({ teamId, kind, importedAt: now, ...item });
      dates.add(item.date);
    }
    if (fresh.length) await db.formResponses.bulkAdd(fresh);
    added = fresh.length;

    for (const { playerId, alias } of aliases) {
      const player = await db.players.get(playerId);
      if (!player || normalize(player.name) === normalize(alias)) continue;
      const current = player.aliases ?? [];
      if (current.some((a) => normalize(a) === normalize(alias))) continue;
      await db.players.update(playerId, { aliases: [...current, alias] });
    }
  });

  const applied = await applyFormResponses(teamId, [...dates], kind);
  return { added, duplicates: items.length - added, ...applied, dates: [...dates].sort() };
}

/** Elige la sesión del día a la que corresponde una respuesta (por si ese día hubo más de una). */
export function pickSession(sessions: Session[], kind: FormKind, submittedAt: number): Session | undefined {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  if (sorted.length <= 1) return sorted[0];
  if (kind === 'pre') {
    // La primera que empieza después (o poco antes) de responder.
    return sorted.find((s) => s.startedAt >= submittedAt - 30 * 60_000) ?? sorted[sorted.length - 1];
  }
  // RPE: la última que ya había empezado al responder.
  return [...sorted].reverse().find((s) => s.startedAt <= submittedAt) ?? sorted[0];
}

/** Cambios en la asistencia a partir de una respuesta. */
export function attendanceChanges(att: Attendance, r: Pick<FormResponse, 'kind' | 'values' | 'submittedAt'>): Partial<Attendance> {
  if (r.kind === 'rpe') {
    return r.values.rpe == null ? {} : { rpe: r.values.rpe, rpeFormAt: r.submittedAt };
  }
  const changes: Partial<Attendance> = { preFormAt: r.submittedAt, playerNote: r.values.note || undefined };
  if (r.values.discomfort != null) changes.discomfort = r.values.discomfort;
  const w = r.values.wellness;
  if (w) {
    const merged = { ...att.wellness, ...w };
    if (hasCompleteWellness(merged)) changes.wellness = merged;
  }
  return changes;
}

/** Crea, actualiza o quita la molestia que declaró la jugadora en el formulario de ese día. */
async function syncFormComplaint(r: FormResponse, sessionId?: string) {
  const existing = (await db.complaints.where('playerId').equals(r.playerId).toArray()).find(
    (c) => c.fromForm && c.date === r.date,
  );
  const level = r.values.discomfort ?? 0;
  if (level <= 0) {
    if (existing) await db.complaints.delete(existing.id!);
    return;
  }
  const where = r.values.discomfortZone ?? '';
  const { zone, side } = zoneFromText(where);
  const data = {
    playerId: r.playerId,
    date: r.date,
    zone,
    side,
    intensity: DISCOMFORT_INTENSITY[level] ?? 5,
    kind: 'molestia' as const,
    description: `Formulario pre-entreno: ${DISCOMFORT_LABEL[level].toLowerCase()}${where ? `. «${where}»` : ''}`,
    fromForm: true,
    ...(sessionId ? { sessionId } : {}),
  };
  if (existing) await db.complaints.update(existing.id!, data);
  else await db.complaints.add({ ...data, createdAt: Date.now() });
}

/**
 * Aplica las respuestas de esas fechas a los entrenamientos del equipo.
 * Si una jugadora respondió varias veces el mismo formulario, vale la última respuesta.
 * Las de días sin entrenamiento quedan pendientes y se aplicarán al crearlo.
 */
export async function applyFormResponses(
  teamId: string,
  dates: string[],
  /** Si se indica, los contadores solo cuentan respuestas de este tipo (las demás se aplican igual). */
  countKind?: FormKind,
): Promise<{ applied: number; pending: number; withoutAttendance: number }> {
  let applied = 0;
  let pending = 0;
  let withoutAttendance = 0;
  await db.transaction('rw', [db.formResponses, db.sessions, db.attendance, db.complaints], async () => {
    for (const date of new Set(dates)) {
      const [sessions, responses] = await Promise.all([
        db.sessions.where('[teamId+date]').equals([teamId, date]).toArray(),
        db.formResponses.where('date').equals(date).filter((r) => r.teamId === teamId).toArray(),
      ]);
      const latest = new Map<string, FormResponse>();
      for (const r of responses) {
        const key = `${r.playerId}|${r.kind}`;
        const cur = latest.get(key);
        if (!cur || r.submittedAt > cur.submittedAt) latest.set(key, r);
      }
      for (const r of latest.values()) {
        const session = pickSession(sessions, r.kind, r.submittedAt);
        if (r.kind === 'pre') await syncFormComplaint(r, session?.id);
        if (!session) {
          if (!countKind || r.kind === countKind) pending++;
          continue;
        }
        const att = await db.attendance.where('[sessionId+playerId]').equals([session.id!, r.playerId]).first();
        if (!att) {
          if (!countKind || r.kind === countKind) withoutAttendance++;
          continue;
        }
        const changes = attendanceChanges(att, r);
        if (Object.keys(changes).length) await db.attendance.update(att.id!, changes);
        if (r.sessionId !== session.id) await db.formResponses.update(r.id!, { sessionId: session.id });
        if (!countKind || r.kind === countKind) applied++;
      }
    }
  });
  return { applied, pending, withoutAttendance };
}

/** Respuestas de un día para un equipo (la última de cada jugadora y tipo). */
export async function latestResponsesOn(teamId: string, date: string) {
  const responses = await db.formResponses.where('date').equals(date).filter((r) => r.teamId === teamId).toArray();
  const latest = new Map<string, FormResponse>();
  for (const r of responses) {
    const key = `${r.playerId}|${r.kind}`;
    const cur = latest.get(key);
    if (!cur || r.submittedAt > cur.submittedAt) latest.set(key, r);
  }
  return [...latest.values()];
}
