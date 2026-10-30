import { addDays, getISODay, subDays } from 'date-fns';
import { createTeam, deleteTeamCascade } from '../db/players';
import { db } from '../db/schema';
import type { Attendance, Block, JumpEvent, Player, Position } from '../db/types';
import { toISODate } from './format';

/** Generador pseudoaleatorio con semilla, para que los datos de ejemplo sean siempre iguales. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_PLAYERS: { name: string; number: number; position: Position; base: number }[] = [
  { name: 'Lucía Martín', number: 1, position: 'Colocadora', base: 210 },
  { name: 'Paula Gómez', number: 12, position: 'Colocadora', base: 180 },
  { name: 'Marta Ruiz', number: 4, position: 'Opuesta', base: 140 },
  { name: 'Irene Sanz', number: 15, position: 'Opuesta', base: 125 },
  { name: 'Carla López', number: 7, position: 'Receptora', base: 115 },
  { name: 'Sara Díaz', number: 9, position: 'Receptora', base: 110 },
  { name: 'Nerea Torres', number: 10, position: 'Receptora', base: 105 },
  { name: 'Alba Navarro', number: 14, position: 'Receptora', base: 100 },
  { name: 'Elena Romero', number: 3, position: 'Central', base: 175 },
  { name: 'Claudia Gil', number: 11, position: 'Central', base: 165 },
  { name: 'Julia Moreno', number: 16, position: 'Central', base: 160 },
  { name: 'Andrea Vega', number: 5, position: 'Líbero', base: 18 },
];

const DEMO_BLOCKS: { name: string; min: number; share: number }[] = [
  { name: 'Calentamiento', min: 15, share: 0.06 },
  { name: 'Técnica de ataque', min: 20, share: 0.3 },
  { name: 'Bloqueo', min: 15, share: 0.2 },
  { name: 'Complejo 1', min: 20, share: 0.19 },
  { name: '6x6', min: 30, share: 0.25 },
];

export async function hasDemoData(): Promise<boolean> {
  return (await db.teams.filter((t) => !!t.demo).count()) > 0;
}

/** Crea un equipo de ejemplo con 5 semanas de entrenamientos. Devuelve el id del equipo. */
export async function seedDemo(): Promise<number> {
  const random = rng(20261030);
  const teamId = await createTeam('Equipo de ejemplo', true);

  const players: Player[] = DEMO_PLAYERS.map((p, i) => ({
    teamId,
    name: p.name,
    number: p.number,
    position: p.position,
    status: i === 7 ? 'readaptacion' : 'activa',
    jumpLimit: i === 7 ? 70 : p.position === 'Central' ? 220 : undefined,
    notes: i === 7 ? 'Vuelta progresiva tras esguince de tobillo.' : undefined,
    archived: 0,
    createdAt: Date.now(),
  }));
  const playerIds = (await db.players.bulkAdd(players, { allKeys: true })) as number[];

  const today = new Date();
  const firstDay = subDays(today, 35);
  const sessionDays: Date[] = [];
  for (let d = firstDay; d <= today; d = addDays(d, 1)) {
    if ([1, 3, 4].includes(getISODay(d))) sessionDays.push(d);
  }

  for (const [si, day] of sessionDays.entries()) {
    const date = toISODate(day);
    const startedAt = new Date(`${date}T18:00:00`).getTime();
    const durationMin = DEMO_BLOCKS.reduce((a, b) => a + b.min, 0);
    const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);
    const isLast = si === sessionDays.length - 1;

    await db.transaction('rw', [db.sessions, db.attendance, db.blocks, db.jumpEvents, db.complaints], async () => {
      const sessionId = (await db.sessions.add({
        teamId,
        date,
        type: 'entrenamiento',
        status: 'finalizado',
        mode: 'vivo',
        startedAt,
        endedAt: startedAt + durationMin * 60_000,
        durationMin,
        notes: isLast ? 'Ejemplo: semana de carga alta antes del partido del sábado.' : undefined,
      })) as number;

      let t = startedAt;
      const blocks: Block[] = DEMO_BLOCKS.map((b, order) => {
        const block = { sessionId, name: b.name, order: order + 1, startedAt: t, endedAt: t + b.min * 60_000 };
        t += b.min * 60_000;
        return block;
      });
      const blockIds = (await db.blocks.bulkAdd(blocks, { allKeys: true })) as number[];

      const attendance: Attendance[] = [];
      const events: JumpEvent[] = [];
      for (const [pi, p] of DEMO_PLAYERS.entries()) {
        const playerId = playerIds[pi];
        const absent = random() < 0.05 && !isLast;
        if (absent) {
          attendance.push({ sessionId, playerId, status: 'ausente', manualJumps: 0, jumps: 0 });
          continue;
        }
        const rehab = pi === 7;
        // Claudia (central) dispara su carga en la última semana para mostrar la alerta de ACWR.
        const spike = pi === 9 && daysAgo < 7 ? 2 : 1;
        const progression = rehab ? 0.35 + (1 - daysAgo / 35) * 0.3 : 1;
        const jumps = Math.max(0, Math.round(p.base * spike * progression * (0.85 + random() * 0.3)));
        for (const [bi, b] of DEMO_BLOCKS.entries()) {
          const n = Math.round(jumps * b.share);
          for (let k = 0; k < n; k++) {
            events.push({
              sessionId,
              playerId,
              blockId: blockIds[bi],
              ts: blocks[bi].startedAt + Math.floor(random() * b.min * 60_000),
            });
          }
        }
        const total = DEMO_BLOCKS.reduce((a, b) => a + Math.round(jumps * b.share), 0);
        const lowWellness = isLast && pi === 4;
        const w = () => Math.min(5, 3 + Math.floor(random() * 3));
        attendance.push({
          sessionId,
          playerId,
          status: rehab ? 'parcial' : 'presente',
          minutes: rehab ? 60 : durationMin,
          rpe: Math.min(10, Math.max(3, Math.round(5 + random() * 3 + (spike > 1 ? 1 : 0)))),
          wellness: lowWellness
            ? { sleep: 2, fatigue: 2, soreness: 3, stress: 3 }
            : { sleep: w(), fatigue: w(), soreness: w(), stress: w() },
          manualJumps: 0,
          jumps: total,
        });
      }
      await db.attendance.bulkAdd(attendance);
      await db.jumpEvents.bulkAdd(events);

      if (isLast) {
        await db.complaints.add({
          playerId: playerIds[9],
          sessionId,
          date,
          zone: 'Rodilla',
          side: 'derecha',
          intensity: 4,
          kind: 'molestia',
          description: 'Molestia en el tendón rotuliano al aterrizar.',
          createdAt: Date.now(),
        });
      }
    });
  }
  return teamId;
}

export async function clearDemo() {
  const demoTeams = await db.teams.filter((t) => !!t.demo).toArray();
  for (const t of demoTeams) await deleteTeamCascade(t.id!);
}
