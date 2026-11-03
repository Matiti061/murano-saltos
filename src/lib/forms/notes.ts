import { normalize } from './text';

/** Respuestas que en realidad significan «nada que comentar». */
const EMPTY_NOTES = new Set([
  'no',
  'nada',
  'no nada',
  'nada mas',
  'ninguna',
  'ninguno',
  'no gracias',
  'nada gracias',
  'no tengo',
  'no tengo nada',
  'todo bien',
  'todo ok',
  'ok',
  'na',
  'nn',
  'x',
]);

/**
 * El mensaje al entrenador, o undefined si es solo un «no» («Nop», «nop 😄», «No nada»…).
 * Los emojis y signos no cuentan.
 */
export function meaningfulNote(text: string | undefined): string | undefined {
  const raw = text?.trim();
  const t = normalize(raw);
  if (!raw || !t) return undefined;
  if (EMPTY_NOTES.has(t) || /^no+p*e*$/.test(t) || /^n+o+p+e*$/.test(t)) return undefined;
  return raw;
}

/** ¿El mensaje avisa de que no va a ir al entrenamiento? («Que no voy a ir», «hoy no voy a entrenar»…). */
export function saysNotComing(note: string | undefined): boolean {
  const t = normalize(note);
  if (!t) return false;
  return /\bno (voy|ire|puedo ir|podre ir|vengo|asistire|alcanzo a ir|llego)\b/.test(t) || /\b(falto|faltare|no asisto)\b/.test(t);
}
