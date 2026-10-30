import { todayISO } from '../lib/format';
import { db } from './schema';
import type { Attendance, AttendanceStatus, SessionType, Wellness } from './types';

export interface AttendanceDraft {
  playerId: number;
  status: AttendanceStatus;
  wellness?: Wellness;
  jumpLimit?: number;
}

export const isPresent = (status: AttendanceStatus) => status === 'presente' || status === 'parcial';

export async function createLiveSession(
  teamId: number,
  type: SessionType,
  drafts: AttendanceDraft[],
): Promise<number> {
  return db.transaction('rw', [db.sessions, db.attendance], async () => {
    const sessionId = (await db.sessions.add({
      teamId,
      date: todayISO(),
      type,
      status: 'en_curso',
      mode: 'vivo',
      startedAt: Date.now(),
    })) as number;
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
}

export interface ManualRow {
  playerId: number;
  status: AttendanceStatus;
  jumps: number;
  minutes?: number;
  rpe?: number;
}

/** Entrenamiento pasado contado en papel: se guardan solo los totales. */
export async function createManualSession(input: {
  teamId: number;
  date: string;
  type: SessionType;
  durationMin: number;
  notes?: string;
  rows: ManualRow[];
}): Promise<number> {
  return db.transaction('rw', [db.sessions, db.attendance], async () => {
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
    })) as number;
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
}

async function getAttendance(sessionId: number, playerId: number) {
  return db.attendance.where('[sessionId+playerId]').equals([sessionId, playerId]).first();
}

/** Recalcula el total de saltos (eventos + ajuste manual). Llamar dentro de una transacción. */
async function recountJumps(sessionId: number, playerId: number): Promise<number> {
  const att = await getAttendance(sessionId, playerId);
  if (!att) return 0;
  const events = await db.jumpEvents.where('[sessionId+playerId]').equals([sessionId, playerId]).count();
  const jumps = events + (att.manualJumps ?? 0);
  await db.attendance.update(att.id!, { jumps });
  return jumps;
}

/**
 * Suma un salto al ejercicio que esté abierto en ese momento y devuelve el nuevo total.
 * El ejercicio se busca dentro de la transacción para no depender del estado de la pantalla.
 */
export async function addJump(sessionId: number, playerId: number): Promise<number> {
  return db.transaction('rw', [db.jumpEvents, db.attendance, db.blocks], async () => {
    const open = await db.blocks
      .where('sessionId')
      .equals(sessionId)
      .filter((b) => b.endedAt == null)
      .last();
    await db.jumpEvents.add({ sessionId, playerId, blockId: open?.id, ts: Date.now() });
    return recountJumps(sessionId, playerId);
  });
}

/**
 * Quita el último salto registrado: de una jugadora concreta o, si no se indica,
 * el último de toda la sesión.
 */
export async function removeLastJump(
  sessionId: number,
  playerId?: number,
): Promise<{ playerId: number; total: number } | null> {
  return db.transaction('rw', [db.jumpEvents, db.attendance], async () => {
    const collection =
      playerId == null
        ? db.jumpEvents.where('sessionId').equals(sessionId)
        : db.jumpEvents.where('[sessionId+playerId]').equals([sessionId, playerId]);
    const events = await collection.toArray();
    if (events.length === 0) return null;
    const last = events.reduce((a, b) => (b.id! > a.id! ? b : a));
    await db.jumpEvents.delete(last.id!);
    const total = await recountJumps(sessionId, last.playerId);
    return { playerId: last.playerId, total };
  });
}

/** Cambia el estado de asistencia (p. ej. una jugadora que llega tarde). Crea el registro si no existe. */
export async function setAttendanceStatus(sessionId: number, playerId: number, status: AttendanceStatus) {
  await db.transaction('rw', [db.attendance], async () => {
    const att = await getAttendance(sessionId, playerId);
    if (att) await db.attendance.update(att.id!, { status });
    else await db.attendance.add({ sessionId, playerId, status, manualJumps: 0, jumps: 0 });
  });
}

export async function updateAttendance(id: number, changes: Partial<Attendance>) {
  await db.transaction('rw', [db.attendance, db.jumpEvents], async () => {
    await db.attendance.update(id, changes);
    if ('manualJumps' in changes) {
      const att = await db.attendance.get(id);
      if (att) await recountJumps(att.sessionId, att.playerId);
    }
  });
}

export async function getOpenBlock(sessionId: number) {
  const blocks = await db.blocks.where('sessionId').equals(sessionId).toArray();
  return blocks.find((b) => b.endedAt == null);
}

export async function startBlock(sessionId: number, name: string): Promise<number> {
  return db.transaction('rw', [db.blocks], async () => {
    const blocks = await db.blocks.where('sessionId').equals(sessionId).toArray();
    const now = Date.now();
    for (const b of blocks) if (b.endedAt == null) await db.blocks.update(b.id!, { endedAt: now });
    return (await db.blocks.add({
      sessionId,
      name: name.trim(),
      order: blocks.length + 1,
      startedAt: now,
    })) as number;
  });
}

export async function endOpenBlock(sessionId: number) {
  const open = await getOpenBlock(sessionId);
  if (open) await db.blocks.update(open.id!, { endedAt: Date.now() });
}

export async function renameBlock(id: number, name: string) {
  await db.blocks.update(id, { name: name.trim() });
}

export interface FinishInput {
  durationMin: number;
  notes?: string;
  rows: { attendanceId: number; rpe?: number; minutes?: number }[];
}

export async function finishSession(sessionId: number, input: FinishInput) {
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
}

/** Vuelve a abrir un entrenamiento finalizado para seguir contando. */
export async function reopenSession(sessionId: number) {
  await db.sessions.update(sessionId, { status: 'en_curso', endedAt: undefined });
}

/** Borra sesiones con todo lo que cuelga de ellas. Llamar dentro de una transacción o sola. */
export async function deleteSessionsCascade(sessionIds: number[]) {
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

export async function getActiveSession(teamId?: number) {
  const active = await db.sessions.where('status').equals('en_curso').toArray();
  return active.filter((s) => teamId == null || s.teamId === teamId).sort((a, b) => b.startedAt - a.startedAt)[0];
}
