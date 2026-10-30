import { db } from './schema';
import { deleteSessionsCascade } from './sessions';
import type { Player } from './types';

export async function createTeam(name: string, demo = false): Promise<number> {
  return (await db.teams.add({ name: name.trim(), demo, createdAt: Date.now() })) as number;
}

export async function renameTeam(id: number, name: string) {
  await db.teams.update(id, { name: name.trim() });
}

/** Borra el equipo con sus jugadoras, entrenamientos y molestias. */
export async function deleteTeamCascade(teamId: number) {
  await db.transaction(
    'rw',
    [db.teams, db.players, db.sessions, db.attendance, db.blocks, db.jumpEvents, db.complaints],
    async () => {
      const sessionIds = (await db.sessions.where('teamId').equals(teamId).primaryKeys()) as number[];
      await deleteSessionsCascade(sessionIds);
      const playerIds = (await db.players.where('teamId').equals(teamId).primaryKeys()) as number[];
      await db.complaints.where('playerId').anyOf(playerIds).delete();
      await db.players.bulkDelete(playerIds);
      await db.teams.delete(teamId);
    },
  );
}

export async function savePlayer(player: Player): Promise<number> {
  const clean: Player = {
    ...player,
    name: player.name.trim(),
    jumpLimit: player.jumpLimit && player.jumpLimit > 0 ? player.jumpLimit : undefined,
    number: player.number ?? undefined,
  };
  return (await db.players.put(clean)) as number;
}

export async function setPlayerArchived(id: number, archived: boolean) {
  await db.players.update(id, { archived: archived ? 1 : 0 });
}

/** Borra la jugadora y todos sus datos (saltos, asistencia, molestias). */
export async function deletePlayerCascade(playerId: number) {
  await db.transaction('rw', [db.players, db.attendance, db.jumpEvents, db.complaints], async () => {
    await db.jumpEvents.where('playerId').equals(playerId).delete();
    await db.attendance.where('playerId').equals(playerId).delete();
    await db.complaints.where('playerId').equals(playerId).delete();
    await db.players.delete(playerId);
  });
}

export function sortPlayers<T extends Pick<Player, 'number' | 'name'>>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    const na = a.number ?? 999;
    const nb = b.number ?? 999;
    return na !== nb ? na - nb : a.name.localeCompare(b.name, 'es');
  });
}
