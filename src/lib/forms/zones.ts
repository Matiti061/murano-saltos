import type { Side } from '../../db/types';
import { hasKeyword, normalize } from './text';

/** Palabras que identifican cada zona de BODY_ZONES (el orden importa: lo más específico primero). */
const ZONE_WORDS: [string, string[]][] = [
  ['Gemelo / Aquiles', ['gemelo', 'aquiles', 'pantorrilla', 'soleo']],
  ['Isquiotibiales', ['isquio', 'femoral']],
  ['Cuádriceps', ['cuadriceps']],
  ['Cadera / ingle', ['cadera', 'ingle', 'aductor', 'pubis']],
  ['Espalda lumbar', ['lumbar', 'zona baja', 'espalda baja']],
  ['Espalda dorsal', ['dorsal', 'espalda alta', 'escapula', 'omoplato']],
  ['Rodilla', ['rodilla', 'menisco', 'rotula', 'rotuliano', 'tendon rotuliano']],
  ['Tobillo', ['tobillo']],
  ['Hombro', ['hombro', 'manguito']],
  ['Codo / muñeca', ['codo', 'muneca']],
  ['Mano / dedos', ['mano', 'dedo', 'pulgar']],
  ['Pie', ['pie', 'planta', 'talon', 'empeine']],
  ['Cuello', ['cuello', 'cervical']],
];

/** Palabras cortas (≤ 3 letras) solo como palabra completa, para que «pie» no coincida con «pierna». */
function has(text: string, word: string) {
  return word.length <= 3 ? ` ${text} `.includes(` ${word} `) : hasKeyword(text, word);
}

/** Intenta reconocer zona y lado en lo que escribió la jugadora («me duele la rodilla derecha»). */
export function zoneFromText(text: string): { zone: string; side: Side } {
  const t = normalize(text);
  let zone = 'Otra';
  for (const [name, words] of ZONE_WORDS) {
    if (words.some((w) => has(t, w))) {
      zone = name;
      break;
    }
  }
  if (zone === 'Otra' && has(t, 'espalda')) zone = 'Espalda lumbar';
  const left = has(t, 'izq') || has(t, 'izquierd');
  const right = has(t, 'der') || has(t, 'derech');
  const both = has(t, 'ambos') || has(t, 'ambas') || has(t, 'las dos') || has(t, 'los dos');
  const side: Side = both || (left && right) ? 'ambos' : left ? 'izquierda' : right ? 'derecha' : 'no aplica';
  return { zone, side };
}

/** Intensidad (0-10) a partir del nivel de molestia del formulario (1 leve, 2 moderada, 3 importante). */
export const DISCOMFORT_INTENSITY: Record<number, number> = { 1: 3, 2: 5, 3: 8 };
export const DISCOMFORT_LABEL: Record<number, string> = {
  0: 'Sin molestias',
  1: 'Molestia leve',
  2: 'Molestia moderada',
  3: 'Dolor importante o lesión',
};
