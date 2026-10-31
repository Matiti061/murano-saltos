import { db } from './schema';
import { deleteSessionsCascade } from './sessions';
import { comparePlayers, POSITIONS, type Player } from './types';

export async function createTeam(name: string, demo = false): Promise<string> {
  return (await db.teams.add({ name: name.trim(), demo, createdAt: Date.now() })) as string;
}

export async function renameTeam(id: string, name: string) {
  await db.teams.update(id, { name: name.trim() });
}

/** Borra el equipo con sus jugadoras, entrenamientos y molestias. */
export async function deleteTeamCascade(teamId: string) {
  await db.transaction(
    'rw',
    [db.teams, db.players, db.sessions, db.attendance, db.blocks, db.jumpEvents, db.complaints],
    async () => {
      const sessionIds = (await db.sessions.where('teamId').equals(teamId).primaryKeys()) as string[];
      await deleteSessionsCascade(sessionIds);
      const playerIds = (await db.players.where('teamId').equals(teamId).primaryKeys()) as string[];
      await db.complaints.where('playerId').anyOf(playerIds).delete();
      await db.players.bulkDelete(playerIds);
      await db.teams.delete(teamId);
    },
  );
}

export async function savePlayer(player: Player): Promise<string> {
  const clean: Player = {
    ...player,
    name: player.name.trim(),
    jumpLimit: player.jumpLimit && player.jumpLimit > 0 ? player.jumpLimit : undefined,
  };
  return (await db.players.put(clean)) as string;
}

export async function setPlayerArchived(id: string, archived: boolean) {
  await db.players.update(id, { archived: archived ? 1 : 0 });
}

/** Borra la jugadora y todos sus datos (saltos, asistencia, molestias). */
export async function deletePlayerCascade(playerId: string) {
  await db.transaction('rw', [db.players, db.attendance, db.jumpEvents, db.complaints], async () => {
    await db.jumpEvents.where('playerId').equals(playerId).delete();
    await db.attendance.where('playerId').equals(playerId).delete();
    await db.complaints.where('playerId').equals(playerId).delete();
    await db.players.delete(playerId);
  });
}

/** Por posición (Armadora → Líbero) y luego por nombre. */
export function sortPlayers<T extends Pick<Player, 'position' | 'name'>>(players: T[]): T[] {
  return [...players].sort(comparePlayers);
}

/** Agrupa en el orden de POSITIONS, omitiendo las posiciones sin jugadoras. */
export function groupByPosition<T>(items: T[], getPlayer: (item: T) => Pick<Player, 'position' | 'name'>) {
  return POSITIONS.map((position) => ({
    position,
    items: items
      .filter((i) => getPlayer(i).position === position)
      .sort((a, b) => getPlayer(a).name.localeCompare(getPlayer(b).name, 'es')),
  })).filter((g) => g.items.length > 0);
}
