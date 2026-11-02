import { strFromU8, unzipSync } from 'fflate';
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/universal';

export type Cell = string | number | boolean | Date | null;

export interface SheetTable {
  headers: string[];
  rows: Cell[][];
}

function fromCsv(text: string): SheetTable {
  const clean = text.replace(/^﻿/, '');
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  const [headers = [], ...rows] = result.data;
  return { headers: headers.map((h) => String(h).trim()), rows };
}

function fromRows(data: Cell[][]): SheetTable {
  const nonEmpty = data.filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => String(h ?? '').trim()), rows };
}

/**
 * Lee el archivo de respuestas que da Google:
 * - .zip de «Descargar respuestas (.csv)» en Google Forms (usa el primer .csv de dentro)
 * - .csv o .xlsx descargado de la hoja de cálculo de respuestas
 */
export async function readFormFile(name: string, data: ArrayBuffer): Promise<SheetTable> {
  const lower = name.toLowerCase();
  const bytes = new Uint8Array(data);
  if (lower.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b && !lower.endsWith('.xlsx'))) {
    const files = unzipSync(bytes);
    const csvName = Object.keys(files).find((f) => f.toLowerCase().endsWith('.csv'));
    if (!csvName) throw new Error('El .zip no contiene ningún archivo .csv.');
    return fromCsv(strFromU8(files[csvName]));
  }
  if (lower.endsWith('.xlsx')) {
    const rows = (await readSheet(data)) as Cell[][];
    return fromRows(rows);
  }
  if (lower.endsWith('.xls')) {
    throw new Error('El formato .xls antiguo no se puede leer. Descarga el archivo como .xlsx o .csv.');
  }
  return fromCsv(new TextDecoder('utf-8').decode(bytes));
}
