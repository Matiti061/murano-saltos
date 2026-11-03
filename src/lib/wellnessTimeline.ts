import type { PlayerSessionRow } from '../db/history';
import type { FormResponse, Wellness } from '../db/types';

export interface WellnessEntry {
  key: string;
  date: string;
  /** Entrenamiento del que viene; sin él, es una encuesta de un día sin entreno creado. */
  sessionId?: string;
  wellness: Partial<Wellness>;
  discomfort?: number;
  discomfortZone?: string;
  note?: string;
  /** Inicio del entreno o momento de la respuesta (para ordenar). */
  ts: number;
}

/**
 * Wellness de una jugadora día a día, del más antiguo al más reciente: el de cada entrenamiento
 * (puede estar corregido a mano) y, para los días sin entrenamiento con wellness, la última
 * respuesta de la encuesta pre-entreno de ese día.
 */
export function wellnessTimeline(rows: PlayerSessionRow[], responses: FormResponse[]): WellnessEntry[] {
  const entries: WellnessEntry[] = rows
    .filter((r) => r.attendance.wellness)
    .map((r) => ({
      key: r.attendance.id!,
      date: r.session.date,
      sessionId: r.session.id,
      wellness: r.attendance.wellness!,
      discomfort: r.attendance.discomfort,
      note: r.attendance.playerNote,
      ts: r.session.startedAt,
    }));
  const covered = new Set(entries.map((e) => e.date));
  const latest = new Map<string, FormResponse>();
  for (const r of responses) {
    if (r.kind !== 'pre' || !r.values.wellness || covered.has(r.date)) continue;
    const cur = latest.get(r.date);
    if (!cur || r.submittedAt > cur.submittedAt) latest.set(r.date, r);
  }
  for (const r of latest.values()) {
    entries.push({
      key: r.id!,
      date: r.date,
      wellness: r.values.wellness!,
      discomfort: r.values.discomfort,
      discomfortZone: r.values.discomfortZone,
      note: r.values.note,
      ts: r.submittedAt,
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts);
}
