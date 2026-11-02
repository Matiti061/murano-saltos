import { hasKeyword, normalize, similarity } from './text';

/** Dato de la app al que corresponde cada columna del formulario. */
export type FormField =
  | 'timestamp'
  | 'name'
  | 'email'
  | 'sleepHours'
  | 'sleep'
  | 'fatigue'
  | 'soreness'
  | 'stress'
  | 'mood'
  | 'discomfortZone'
  | 'discomfort'
  | 'readiness'
  | 'note'
  | 'rpe'
  | 'ignore';

export const FIELD_LABEL: Record<FormField, string> = {
  timestamp: 'Fecha y hora de respuesta',
  name: 'Nombre de la jugadora',
  email: 'Correo',
  sleepHours: 'Horas de sueño',
  sleep: 'Calidad del sueño',
  fatigue: 'Fatiga',
  soreness: 'Dolor muscular',
  stress: 'Estrés',
  mood: 'Ánimo',
  discomfortZone: 'Zona de la molestia',
  discomfort: 'Molestia física o lesión',
  readiness: 'Preparación para entrenar',
  note: 'Mensaje al entrenador',
  rpe: 'RPE (intensidad 1-10)',
  ignore: 'No usar',
};

export const WELLNESS_FIELDS = ['sleepHours', 'sleep', 'fatigue', 'soreness', 'stress', 'mood', 'readiness'] as const;
export type WellnessField = (typeof WELLNESS_FIELDS)[number];

/**
 * Cómo reconocer cada pregunta por su enunciado. El orden importa: se prueba de arriba abajo
 * (p. ej. «parte del cuerpo» antes que «molestia», y «calidad del sueño» antes que «dormiste»).
 * Cada entrada es una lista de palabras que deben aparecer todas.
 */
const FIELD_KEYWORDS: [FormField, string[][]][] = [
  ['timestamp', [['marca', 'temporal'], ['timestamp'], ['fecha', 'hora']]],
  ['email', [['correo'], ['email'], ['e', 'mail']]],
  ['discomfortZone', [['parte', 'cuerpo'], ['zona'], ['donde']]],
  ['sleep', [['calidad', 'sueno'], ['calidad', 'dormi']]],
  ['sleepHours', [['cuanto', 'dormi'], ['horas', 'dormi'], ['horas', 'sueno']]],
  ['fatigue', [['fatiga'], ['cansancio'], ['cansada']]],
  ['soreness', [['dolor', 'muscular']]],
  ['stress', [['estres']]],
  ['mood', [['animo']]],
  ['discomfort', [['molestia'], ['lesion']]],
  ['readiness', [['preparada'], ['preparado'], ['preparacion']]],
  ['note', [['comunicar'], ['entrenador'], ['comentario'], ['observacion']]],
  ['rpe', [['intenso'], ['intensidad'], ['rpe'], ['esfuerzo'], ['que', 'tan', 'duro']]],
  ['name', [['nombre'], ['jugadora'], ['quien', 'eres']]],
];

/** Campo que corresponde a un enunciado, o null si no se reconoce. */
export function fieldForHeader(header: string): FormField | null {
  const text = normalize(header);
  for (const [field, groups] of FIELD_KEYWORDS) {
    if (groups.some((words) => words.every((w) => hasKeyword(text, w)))) return field;
  }
  return null;
}

/**
 * Opciones del formulario del profesor en orden de valor. Para las escalas 1-5 el primer texto vale 1
 * y el último 5 (5 = mejor siempre). La molestia va de 0 (ninguna) a 3.
 */
export const FIELD_OPTIONS: Partial<Record<FormField, { options: string[]; first: number }>> = {
  sleepHours: {
    first: 1,
    options: ['menos de 5 horas', 'entre 5 y 6 horas', 'entre 6 y 7 horas', 'entre 7 y 8 horas', 'mas de 8 horas'],
  },
  sleep: { first: 1, options: ['muy mala', 'mala', 'regular', 'buena', 'excelente'] },
  fatigue: {
    first: 1,
    options: ['cansancio extremo', 'mucho cansancio', 'cansancio moderado', 'poco cansancio', 'nada de cansancio'],
  },
  soreness: {
    first: 1,
    options: ['dolor muy intenso', 'dolor intenso', 'dolor moderado', 'dolor leve', 'sin dolor muscular'],
  },
  stress: { first: 1, options: ['estres extremo', 'mucho estres', 'estres moderado', 'poco estres', 'nada de estres'] },
  mood: { first: 1, options: ['muy desanimada', 'desanimada', 'normal', 'animada', 'muy animada'] },
  readiness: {
    first: 1,
    options: ['nada preparada', 'poco preparada', 'medianamente preparada', 'bien preparada', 'totalmente preparada'],
  },
  discomfort: {
    first: 0,
    options: ['no ninguna', 'si molestia leve', 'si molestia moderada', 'si dolor importante o lesion'],
  },
};

/** Similitud mínima para aceptar una opción escrita distinta (erratas, género…). */
const MIN_OPTION_SIMILARITY = 0.7;

/**
 * Convierte la respuesta de una pregunta de opciones a su valor numérico.
 * Acepta el texto de la opción (tolerando erratas como «Dolor inteno») o un número dentro de la escala.
 */
export function optionValue(field: FormField, answer: unknown): number | undefined {
  const def = FIELD_OPTIONS[field];
  const text = normalize(answer);
  if (!def || !text) return undefined;
  const min = def.first;
  const max = def.first + def.options.length - 1;
  const exact = def.options.indexOf(text);
  if (exact >= 0) return min + exact;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return n >= min && n <= max ? n : undefined;
  }
  let best = -1;
  let bestScore = 0;
  def.options.forEach((opt, i) => {
    const score = similarity(text, opt);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= MIN_OPTION_SIMILARITY ? min + best : undefined;
}

/** RPE: número 1-10 (también «7 - Muy duro» o «7,5»). */
export function rpeValue(answer: unknown): number | undefined {
  const m = String(answer ?? '').trim().match(/^(\d{1,2})(?:[.,](\d))?/);
  if (!m) return undefined;
  const n = Number(`${m[1]}.${m[2] ?? 0}`);
  return n >= 0 && n <= 10 ? Math.round(n) : undefined;
}
