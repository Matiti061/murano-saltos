import { todayISO } from '../lib/format';
import { countEvents, mergeBlockJumps, totalJumps } from '../lib/jumps';
import { applyFormResponses } from './forms';
import { db } from './schema';
import type { Attendance, AttendanceStatus, SessionType, Wellness } from './types';

export interface AttendanceDraft {
  playerId: string;
  status: AttendanceStatus;
  wellness?: Wellness;
  jumpLimit?: number;
}

export const isPresent = (status: AttendanceStatus) => status === 'presente' || status === 'parcial';

export async function createLiveSession(
  teamId: string,
  type: SessionType,
  drafts: AttendanceDraft[],
): Promise<string> {
  const created = await db.transaction('rw', [db.sessions, db.attendance], async () => {
    const sessionId = (await db.sessions.add({
      teamId,
      date: todayISO(),
      type,
      status: 'en_curso',
      mode: 'vivo',
      startedAt: Date.now(),
    })) as string;
    await db.attendance.bulkAdd(
      drafts.map((d) => ({
        sessionId,
        playerId: d.playerId,
        status: d.status,
        wellness: d.wellness,
        jumpLimit: d.jumpLimit,
        manualJumps: 0,
        jumps: 0,
      })),
    );
    return sessionId;
  });
  // Wellness y molestias que las jugadoras ya enviaron por formulario hoy.
  await applyFormResponses(teamId, [todayISO()]);
  return created;
}

export interface ManualRow {
  playerId: string;
  status: AttendanceStatus;
  jumps: number;
  minutes?: number;
  rpe?: number;
}

/** Entrenamiento pasado contado en papel: se guardan solo los totales. */
export async function createManualSession(input: {
  teamId: string;
  date: string;
  type: SessionType;
  durationMin: number;
  notes?: string;
  rows: ManualRow[];
}): Promise<string> {
  const created = await db.transaction('rw', [db.sessions, db.attendance], async () => {
    const startedAt = new Date(`${input.date}T18:00:00`).getTime();
    const sessionId = (await db.sessions.add({
      teamId: input.teamId,
      date: input.date,
      type: input.type,
      status: 'finalizado',
      mode: 'manual',
      startedAt,
      endedAt: startedAt + input.durationMin * 60_000,
      durationMin: input.durationMin,
      notes: input.notes,
    })) as string;
    await db.attendance.bulkAdd(
      input.rows.map((r) => {
        const present = isPresent(r.status);
        return {
          sessionId,
          playerId: r.playerId,
          status: r.status,
          manualJumps: present ? r.jumps : 0,
          jumps: present ? r.jumps : 0,
          minutes: present ? (r.minutes ?? input.durationMin) : undefined,
          rpe: present ? r.rpe : undefined,
        };
      }),
    );
    return sessionId;
  });
  await applyFormResponses(input.teamId, [input.date]);
  return created;
}

async function getAttendance(sessionId: string, playerId: string) {
  return db.attendance.where('[sessionId+playerId]').equals([sessionId, playerId]).first();
}

/** Recalcula el total de saltos guardado. Llamar dentro de una transacción. */
async function recountJumps(sessionId: string, playerId: string): Promise<number> {
  const att = await getAttendance(sessionId, playerId);
  if (!att) return 0;
  const pending = await db.jumpEvents.where('[sessionId+playerId]').equals([sessionId, playerId]).count();
  const jumps = totalJumps(att, pending);
  if (jumps !== att.jumps) await db.attendance.update(att.id!, { jumps });
  return jumps;
}

/**
 * Suma un salto al ejercicio que esté abierto en ese momento y devuelve el nuevo total.
 * El ejercicio se busca dentro de la transacción para no depender del estado de la pantalla.
 */
export async function addJump(sessionId: string, playerId: string): Promise<number> {
  return db.transaction('rw', [db.jumpEvents, db.attendance, db.blocks], async () => {
    const open = await getOpenBlock(sessionId);
    await db.jumpEvents.add({ sessionId, playerId, ...(open ? { blockId: open.id } : {}), ts: Date.now() });
    return recountJumps(sessionId, playerId);
  });
}

/**
 * Quita el último salto registrado (de una jugadora o, si no se indica, de toda la sesión).
 * Solo se pueden deshacer toques de la sesión en curso; los ya compactados se corrigen con el ajuste manual.
 */
export async function removeLastJump(
  sessionId: string,
  playerId?: string,
): Promise<{ playerId: string; total: number } | null> {
  return db.transaction('rw', [db.jumpEvents, db.attendance], async () => {
    const collection =
      playerId == null
        ? db.jumpEvents.where('sessionId').equals(sessionId)
        : db.jumpEvents.where('[sessionId+playerId]').equals([sessionId, playerId]);
    const events = await collection.toArray();
    if (events.length === 0) return null;
    const last = events.reduce((a, b) => (b.ts > a.ts || (b.ts === a.ts && b.id! > a.id!) ? b : a));
    await db.jumpEvents.delete(last.id!);
    const total = await recountJumps(sessionId, last.playerId);
    return { playerId: last.playerId, total };
  });
}

/**
 * Resume los toques de una sesión en `blockJumps` y los borra, para que la nube ocupe poco.
 * Es idempotente y seguro aunque otro dispositivo haga lo mismo.
 */
export async function compactSession(sessionId: string) {
  await db.transaction('rw', [db.jumpEvents, db.attendance], async () => {
    const events = await db.jumpEvents.where('sessionId').equals(sessionId).toArray();
    if (events.length === 0) return;
    const byPlayer = countEvents(events);
    const atts = await db.attendance.where('sessionId').equals(sessionId).toArray();
    for (const att of atts) {
      const counts = byPlayer.get(att.playerId);
      if (!counts) continue;
      const blockJumps = mergeBlockJumps(att.blockJumps, counts);
      const updated = { ...att, blockJumps };
      await db.attendance.update(att.id!, { blockJumps, jumps: totalJumps(updated, 0) });
    }
    // Solo se borran los toques de jugadoras con asistencia; el resto se deja para no perder nada.
    const withAttendance = new Set(atts.map((a) => a.playerId));
    await db.jumpEvents.bulkDelete(events.filter((e) => withAttendance.has(e.playerId)).map((e) => e.id!));
  });
}

/** Compacta toques que hayan quedado en sesiones ya finalizadas (p. ej. llegados tarde desde otro dispositivo). */
export async function compactFinishedLeftovers() {
  // Solo quedan toques de sesiones en curso (pocos), así que leerlos todos es barato.
  const sessionIds = new Set((await db.jumpEvents.toArray()).map((e) => e.sessionId));
  if (sessionIds.size === 0) return;
  const sessions = await db.sessions.bulkGet([...sessionIds]);
  for (const s of sessions) if (s?.status === 'finalizado') await compactSession(s.id!);
}

/** Cambia el estado de asistencia (p. ej. una jugadora que llega tarde). Crea el registro si no existe. */
export async function setAttendanceStatus(sessionId: string, playerId: string, status: AttendanceStatus) {
  await db.transaction('rw', [db.attendance], async () => {
    const att = await getAttendance(sessionId, playerId);
    if (att) await db.attendance.update(att.id!, { status });
    else await db.attendance.add({ sessionId, playerId, status, manualJumps: 0, jumps: 0 });
  });
}

export async function updateAttendance(id: string, changes: Partial<Attendance>) {
  await db.transaction('rw', [db.attendance, db.jumpEvents], async () => {
    await db.attendance.update(id, changes);
    if ('manualJumps' in changes) {
      const att = await db.attendance.get(id);
      if (att) await recountJumps(att.sessionId, att.playerId);
    }
  });
}

/** El ejercicio abierto más reciente de la sesión. */
export async function getOpenBlock(sessionId: string) {
  const open = (await db.blocks.where('sessionId').equals(sessionId).toArray()).filter((b) => b.endedAt == null);
  return open.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export async function startBlock(sessionId: string, name: string): Promise<string> {
  return db.transaction('rw', [db.blocks], async () => {
    const blocks = await db.blocks.where('sessionId').equals(sessionId).toArray();
    const now = Date.now();
    for (const b of blocks) if (b.endedAt == null) await db.blocks.update(b.id!, { endedAt: now });
    return (await db.blocks.add({
      sessionId,
      name: name.trim(),
      order: Math.max(0, ...blocks.map((b) => b.order)) + 1,
      startedAt: now,
    })) as string;
  });
}

export async function endOpenBlock(sessionId: string) {
  const open = await getOpenBlock(sessionId);
  if (open) await db.blocks.update(open.id!, { endedAt: Date.now() });
}

export async function renameBlock(id: string, name: string) {
  await db.blocks.update(id, { name: name.trim() });
}

export interface FinishInput {
  durationMin: number;
  notes?: string;
  rows: { attendanceId: string; rpe?: number; minutes?: number }[];
}

export async function finishSession(sessionId: string, input: FinishInput) {
  await db.transaction('rw', [db.sessions, db.attendance, db.blocks], async () => {
    const now = Date.now();
    const blocks = await db.blocks.where('sessionId').equals(sessionId).toArray();
    for (const b of blocks) if (b.endedAt == null) await db.blocks.update(b.id!, { endedAt: now });
    for (const r of input.rows) {
      await db.attendance.update(r.attendanceId, { rpe: r.rpe, minutes: r.minutes });
    }
    const session = await db.sessions.get(sessionId);
    await db.sessions.update(sessionId, {
      status: 'finalizado',
      endedAt: session?.endedAt ?? now,
      durationMin: input.durationMin,
      notes: input.notes?.trim() || undefined,
    });
  });
  await compactSession(sessionId);
}

/** Vuelve a abrir un entrenamiento finalizado para seguir contando. */
export async function reopenSession(sessionId: string) {
  await db.sessions.update(sessionId, { status: 'en_curso', endedAt: undefined });
}

/** Borra sesiones con todo lo que cuelga de ellas. Llamar dentro de una transacción o sola. */
export async function deleteSessionsCascade(sessionIds: string[]) {
  if (sessionIds.length === 0) return;
  await db.transaction(
    'rw',
    [db.sessions, db.attendance, db.blocks, db.jumpEvents, db.complaints],
    async () => {
      await db.jumpEvents.where('sessionId').anyOf(sessionIds).delete();
      await db.blocks.where('sessionId').anyOf(sessionIds).delete();
      await db.attendance.where('sessionId').anyOf(sessionIds).delete();
      // Las molestias se conservan (son historial médico), solo se desvinculan.
      await db.complaints
        .where('sessionId')
        .anyOf(sessionIds)
        .modify((c) => {
          delete c.sessionId;
        });
      await db.sessions.bulkDelete(sessionIds);
    },
  );
}

export async function getActiveSession(teamId?: string) {
  const active = await db.sessions.where('status').equals('en_curso').toArray();
  return active.filter((s) => teamId == null || s.teamId === teamId).sort((a, b) => b.startedAt - a.startedAt)[0];
}
