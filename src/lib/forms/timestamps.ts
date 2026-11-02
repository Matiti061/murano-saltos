/** Orden día/mes de las fechas con barras: «dmy» (02/11/2026, España/Chile) o «mdy» (11/02/2026, EE. UU.). */
export type DateOrder = 'dmy' | 'mdy';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function localTime(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  const date = new Date(y, mo - 1, d, h, mi, s);
  return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date.getTime();
}

/**
 * Convierte la «Marca temporal» de Google Forms/Sheets a milisegundos.
 * Formatos admitidos:
 * - «2026/11/02 6:05:33 p. m. GMT-3» (descarga .csv de Forms)
 * - «02/11/2026 18:05:33», «02-11-2026 18:05», «2026-11-02 18:05:33» (Hojas de cálculo)
 * - fechas de Excel (Date o número de serie)
 */
export function parseTimestamp(value: unknown, order: DateOrder = 'dmy'): number | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') {
    // Número de serie de Excel: días desde 1899-12-30, en hora local (sin zona horaria).
    const asUtc = new Date(EXCEL_EPOCH + Math.round(value * 86_400_000));
    return localTime(
      asUtc.getUTCFullYear(),
      asUtc.getUTCMonth() + 1,
      asUtc.getUTCDate(),
      asUtc.getUTCHours(),
      asUtc.getUTCMinutes(),
      asUtc.getUTCSeconds(),
    );
  }

  const text = String(value).trim().toLowerCase();
  const m = text.match(
    /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ t,]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*([ap])?\.?\s*(?:m\.?)?\s*(?:(?:gmt|utc)\s*([+-]\d{1,2})(?::?(\d{2}))?|z)?/,
  );
  if (!m) return null;
  let [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let y: number, mo: number, d: number;
  if (m[1].length === 4) {
    [y, mo, d] = [a, b, c];
  } else {
    if (c < 100) c += 2000;
    y = c;
    [d, mo] = order === 'dmy' ? [a, b] : [b, a];
  }
  let h = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const s = Number(m[6] ?? 0);
  const ampm = m[7];
  if (ampm === 'p' && h < 12) h += 12;
  if (ampm === 'a' && h === 12) h = 0;

  const offsetH = m[8];
  if (offsetH != null || /z\s*$/.test(text)) {
    const sign = offsetH?.startsWith('-') ? -1 : 1;
    const offMin = offsetH != null ? sign * (Math.abs(Number(offsetH)) * 60 + Number(m[9] ?? 0)) : 0;
    const utc = Date.UTC(y, mo - 1, d, h, mi, s) - offMin * 60_000;
    return Number.isNaN(utc) ? null : utc;
  }
  return localTime(y, mo, d, h, mi, s);
}

/** Decide si una columna usa día/mes o mes/día mirando valores imposibles (>12) en cada posición. */
export function detectDateOrder(values: unknown[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/) : null;
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? 'mdy' : 'dmy';
}
