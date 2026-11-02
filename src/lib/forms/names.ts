import type { Player } from '../../db/types';
import { normalize, similarity } from './text';

export type MatchMethod = 'exacto' | 'alias' | 'parecido' | 'ninguno';

export interface PlayerMatch {
  player?: Player;
  method: MatchMethod;
  /** true si conviene que la persona lo revise antes de importar. */
  doubtful: boolean;
}

const MIN_SIMILARITY = 0.75;

/**
 * Busca la jugadora que corresponde al nombre elegido en el formulario:
 * nombre exacto (sin tildes ni mayúsculas) → alias aprendidos → mismas palabras → nombre más parecido.
 */
export function matchPlayer(rawName: unknown, players: Player[]): PlayerMatch {
  const name = normalize(rawName);
  if (!name) return { method: 'ninguno', doubtful: true };

  const exact = players.filter((p) => normalize(p.name) === name);
  if (exact.length === 1) return { player: exact[0], method: 'exacto', doubtful: false };

  const alias = players.filter((p) => p.aliases?.some((a) => normalize(a) === name));
  if (alias.length === 1) return { player: alias[0], method: 'alias', doubtful: false };

  // «Ana Martínez» ↔ «Ana María Martínez Pérez»: todas las palabras de uno están en el otro.
  const words = name.split(' ');
  const subset = players.filter((p) => {
    const pw = normalize(p.name).split(' ');
    return words.every((w) => pw.includes(w)) || pw.every((w) => words.includes(w));
  });
  if (subset.length === 1) return { player: subset[0], method: 'parecido', doubtful: false };

  let best: Player | undefined;
  let bestScore = 0;
  let second = 0;
  for (const p of players) {
    const score = similarity(name, normalize(p.name));
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = p;
    } else if (score > second) {
      second = score;
    }
  }
  if (best && bestScore >= MIN_SIMILARITY) {
    return { player: best, method: 'parecido', doubtful: bestScore < 0.9 || bestScore - second < 0.1 };
  }
  return { method: 'ninguno', doubtful: true };
}
