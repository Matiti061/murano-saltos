import type { Side } from '../../db/types';
import { hasKeyword, normalize } from './text';

/** Palabras que identifican cada zona de BODY_ZONES. */
const ZONE_WORDS: [string, string[]][] = [
  ['Gemelo / Aquiles', ['gemelo', 'aquiles', 'pantorrilla', 'soleo']],
  ['Isquiotibiales', ['isquio', 'femoral']],
  ['Cuádriceps', ['cuadriceps']],
  ['Cadera / ingle', ['cadera', 'ingle', 'aductor', 'pubis']],
  ['Espalda lumbar', ['lumbar', 'espalda baja', 'zona baja']],
  ['Espalda dorsal', ['dorsal', 'espalda alta', 'escapula', 'omoplato']],
  ['Rodilla', ['rodilla', 'menisco', 'rotula', 'rotuliano']],
  ['Tobillo', ['tobillo']],
  ['Hombro', ['hombro', 'manguito']],
  ['Codo / muñeca', ['codo', 'muneca']],
  ['Mano / dedos', ['mano', 'dedo', 'pulgar']],
  ['Pie', ['pie', 'planta', 'talon', 'empeine']],
  ['Cuello', ['cuello', 'cervical']],
  ['Pierna / muslo', ['pierna', 'muslo']],
  // Lo último: «espalda» a secas (si no se dijo baja/alta) va a lumbar.
  ['Espalda lumbar', ['espalda']],
];

/** Posición de la palabra en el texto o -1. Las cortas (≤ 3 letras) solo como palabra completa: «pie» no es «pierna». */
function indexOfWord(text: string, word: string): number {
  const padded = ` ${text} `;
  if (word.length <= 3) return padded.indexOf(` ${word} `);
  return hasKeyword(text, word) ? padded.indexOf(` ${word}`) : -1;
}

const has = (text: string, word: string) => indexOfWord(text, word) >= 0;

function sideOf(text: string): Side {
  const left = has(text, 'izq') || has(text, 'izquierd');
  const right = has(text, 'der') || has(text, 'derech');
  const both = has(text, 'ambos') || has(text, 'ambas') || has(text, 'las dos') || has(text, 'los dos');
  return both || (left && right) ? 'ambos' : left ? 'izquierda' : right ? 'derecha' : 'no aplica';
}

/** Zona que aparece antes en un trozo de texto, y si se nombró en plural («rodillas», «piernas»). */
function firstZone(text: string): { zone: string; plural: boolean } | null {
  let best: { zone: string; plural: boolean } | null = null;
  let bestIndex = Infinity;
  for (const [zone, words] of ZONE_WORDS) {
    for (const w of words) {
      const i = indexOfWord(text, w);
      if (i >= 0 && i < bestIndex) {
        bestIndex = i;
        best = { zone, plural: w.length > 3 && hasKeyword(text, `${w}s`) };
      }
    }
  }
  return best;
}

/**
 * Zonas y lados de lo que escribió la jugadora, en orden y sin repetir:
 * «Rodilla izquierda, hombro derecho» → Rodilla izquierda + Hombro derecha;
 * «tobillo y espalda baja» → Tobillo + Espalda lumbar. Si no reconoce ninguna, «Otra».
 */
export function zonesFromText(text: string): { zone: string; side: Side }[] {
  const parts = String(text ?? '')
    .split(/[,;/+]|\s+y\s+|\s+e\s+/i)
    .map(normalize)
    .filter(Boolean);
  const out: { zone: string; side: Side }[] = [];
  for (const part of parts) {
    const found = firstZone(part);
    if (!found) continue;
    const { zone } = found;
    let side = sideOf(part);
    if (side === 'no aplica' && found.plural && zone !== 'Espalda lumbar') side = 'ambos';
    const existing = out.find((z) => z.zone === zone);
    if (!existing) out.push({ zone, side });
    else if (existing.side !== side && side !== 'no aplica') existing.side = existing.side === 'no aplica' ? side : 'ambos';
  }
  if (out.length === 0) out.push({ zone: 'Otra', side: sideOf(normalize(text)) });
  return out;
}

/** La primera zona reconocida (compatibilidad). */
export function zoneFromText(text: string): { zone: string; side: Side } {
  return zonesFromText(text)[0];
}

/** Intensidad (0-10) a partir del nivel de molestia del formulario (1 leve, 2 moderada, 3 importante). */
export const DISCOMFORT_INTENSITY: Record<number, number> = { 1: 3, 2: 5, 3: 8 };
export const DISCOMFORT_LABEL: Record<number, string> = {
  0: 'Sin molestias',
  1: 'Molestia leve',
  2: 'Molestia moderada',
  3: 'Dolor importante o lesión',
};
