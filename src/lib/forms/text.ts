/** Minúsculas, sin tildes ni signos, espacios simples: «¿Cómo está tu ÁNIMO?» → «como esta tu animo». */
export function normalize(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** ¿Aparece la palabra (o el inicio de palabra) `keyword` en `text`, ambos normalizados? */
export function hasKeyword(text: string, keyword: string): boolean {
  return ` ${text} `.includes(` ${keyword}`);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Parecido entre 0 y 1 de dos textos ya normalizados. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/** Texto de una celda tal cual (fechas de Excel incluidas). */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}
