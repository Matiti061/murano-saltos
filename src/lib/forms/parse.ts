import type { FormKind, FormValues, Player, Wellness } from '../../db/types';
import { toISODate } from '../format';
import { FIELD_LABEL, fieldForHeader, optionValue, rpeValue, WELLNESS_FIELDS, type FormField } from './fields';
import { matchPlayer, type PlayerMatch } from './names';
import { meaningfulNote } from './notes';
import type { Cell, SheetTable } from './readFile';
import { cellText, normalize } from './text';
import { detectDateOrder, parseTimestamp, type DateOrder } from './timestamps';

export interface ColumnInfo {
  index: number;
  header: string;
  field: FormField;
  /** false si lo eligió la persona (o viene de una corrección guardada). */
  auto: boolean;
}

export interface DetectedForm {
  columns: ColumnInfo[];
  kind: FormKind | null;
  dateOrder: DateOrder;
}

/** Correcciones guardadas: enunciado normalizado → campo. */
export type SavedColumnMap = Record<string, string>;

const isField = (f: string): f is FormField => f in FIELD_LABEL;

export function kindFromColumns(columns: ColumnInfo[]): FormKind | null {
  const fields = new Set(columns.map((c) => c.field));
  if (WELLNESS_FIELDS.some((f) => fields.has(f))) return 'pre';
  if (fields.has('rpe')) return 'rpe';
  return null;
}

/** Proporción de valores de una columna que corresponden a alguna jugadora. */
function nameMatchRatio(table: SheetTable, index: number, players: Player[]) {
  const values = table.rows.map((r) => r[index]).filter((v) => cellText(v));
  if (values.length === 0) return 0;
  return values.filter((v) => matchPlayer(v, players).player).length / values.length;
}

/** Reconoce el tipo de formulario y qué es cada columna. */
export function detectForm(table: SheetTable, players: Player[], saved: SavedColumnMap = {}): DetectedForm {
  const used = new Set<FormField>();
  const columns: ColumnInfo[] = table.headers.map((header, index) => {
    const savedField = saved[normalize(header)];
    let field: FormField = savedField && isField(savedField) ? savedField : (fieldForHeader(header) ?? 'ignore');
    // Una columna por dato: si se repite, la segunda no se usa.
    if (field !== 'ignore' && used.has(field)) field = 'ignore';
    if (field !== 'ignore') used.add(field);
    return { index, header, field, auto: !savedField };
  });

  if (!used.has('timestamp')) {
    const col = columns.find(
      (c) => c.field === 'ignore' && table.rows.length > 0 && table.rows.filter((r) => parseTimestamp(r[c.index]) != null).length / table.rows.length >= 0.8,
    );
    if (col) col.field = 'timestamp';
  }
  if (!columns.some((c) => c.field === 'name')) {
    let best: ColumnInfo | undefined;
    let bestRatio = 0.5;
    for (const c of columns.filter((c) => c.field === 'ignore')) {
      const ratio = nameMatchRatio(table, c.index, players);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = c;
      }
    }
    if (best) best.field = 'name';
  }

  const tsCol = columns.find((c) => c.field === 'timestamp');
  const dateOrder = tsCol ? detectDateOrder(table.rows.map((r) => r[tsCol.index])) : 'dmy';
  return { columns, kind: kindFromColumns(columns), dateOrder };
}

export interface ParsedRow {
  /** Número de fila en la hoja (la 1 es el encabezado). */
  sheetRow: number;
  submittedAt: number | null;
  date: string | null;
  rawName: string;
  match: PlayerMatch;
  values: FormValues;
  raw: Record<string, string>;
  /** Respuestas que no se pudieron interpretar. */
  problems: string[];
}

const CORE: (keyof Wellness)[] = ['sleep', 'fatigue', 'soreness', 'stress'];

export function hasCompleteWellness(w: Partial<Wellness> | undefined): w is Wellness {
  return !!w && CORE.every((k) => typeof w[k] === 'number');
}

/** Convierte cada fila del archivo en una respuesta con su jugadora y sus valores. */
export function parseRows(table: SheetTable, form: DetectedForm, kind: FormKind, players: Player[]): ParsedRow[] {
  const col = (field: FormField) => form.columns.find((c) => c.field === field)?.index;
  const tsIndex = col('timestamp');
  const nameIndex = col('name');

  return table.rows.map((row: Cell[], i) => {
    const problems: string[] = [];
    const raw: Record<string, string> = {};
    form.columns.forEach((c) => {
      const t = cellText(row[c.index]);
      if (t) raw[c.header] = t;
    });

    const submittedAt = tsIndex == null ? null : parseTimestamp(row[tsIndex], form.dateOrder);
    if (submittedAt == null) problems.push('Sin fecha y hora de respuesta');
    const rawName = nameIndex == null ? '' : cellText(row[nameIndex]);
    const match = matchPlayer(rawName, players);

    const values: FormValues = {};
    const text = (field: FormField) => {
      const idx = col(field);
      return idx == null ? '' : cellText(row[idx]);
    };

    if (kind === 'pre') {
      const wellness: Partial<Wellness> = {};
      for (const field of WELLNESS_FIELDS) {
        const answer = text(field);
        if (!answer) continue;
        const v = optionValue(field, answer);
        if (v == null) problems.push(`No se entiende «${answer}» en ${FIELD_LABEL[field].toLowerCase()}`);
        else wellness[field] = v;
      }
      if (Object.keys(wellness).length) values.wellness = wellness;
      const discomfort = text('discomfort');
      if (discomfort) {
        const v = optionValue('discomfort', discomfort);
        if (v == null) problems.push(`No se entiende «${discomfort}» en molestia`);
        else values.discomfort = v;
      }
      const zone = text('discomfortZone');
      if (zone) values.discomfortZone = zone;
      const note = meaningfulNote(text('note'));
      if (note) values.note = note;
    } else {
      const answer = text('rpe');
      const v = rpeValue(answer);
      if (v == null) problems.push(answer ? `No se entiende «${answer}» como RPE` : 'Sin RPE');
      else values.rpe = v;
    }

    return {
      sheetRow: i + 2,
      submittedAt,
      date: submittedAt == null ? null : toISODate(submittedAt),
      rawName,
      match,
      values,
      raw,
      problems,
    };
  });
}
