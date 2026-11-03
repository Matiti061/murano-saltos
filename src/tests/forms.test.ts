import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { attendanceChanges, pickSession } from '../db/forms';
import type { Attendance, Player, Session } from '../db/types';
import { fieldForHeader, optionValue, rpeValue } from '../lib/forms/fields';
import { matchPlayer } from '../lib/forms/names';
import { detectForm, parseRows } from '../lib/forms/parse';
import { readFormFile } from '../lib/forms/readFile';
import { detectDateOrder, parseTimestamp } from '../lib/forms/timestamps';
import { zoneFromText, zonesFromText } from '../lib/forms/zones';
import { meaningfulNote, saysNotComing } from '../lib/forms/notes';

const players: Player[] = [
  { id: 'p1', teamId: 't', name: 'Lucía Martín', position: 'Armadora', status: 'activa', archived: 0, createdAt: 0 },
  { id: 'p2', teamId: 't', name: 'Ana María Martínez', position: 'Central', status: 'activa', archived: 0, createdAt: 0 },
  { id: 'p3', teamId: 't', name: 'Sofía Rojas', position: 'Líbero', status: 'activa', archived: 0, createdAt: 0, aliases: ['Sofi'] },
];

// Encabezados reales del formulario pre-entreno del profesor (descarga .csv de Google Forms).
const PRE_HEADERS = [
  'Marca temporal',
  'Nombre',
  '¿Cuanto dormiste anoche?',
  '¿Como fue tu calidad del sueño?',
  '¿Que nivel de fatiga o cansancio sientes hoy?',
  '¿Que nivel de dolor muscular tienes hoy?',
  '¿Como esta tu nivel de estres hoy?',
  '¿Como esta tu estado de animo hoy?',
  '¿Tienes alguna molestia fisica o lesion que pueda afectar el entrenamiento?',
  'Si tienes alguna molestia, ¿En que parte del cuerpo?',
  '¿Que tan preparada te sientes para entrenar hoy?',
  '¿Hay algo que quieras comunicarle a tu entrenador antes de comenzar?',
];

const csvLine = (cells: string[]) => cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');

const PRE_CSV =
  '﻿' +
  [
    csvLine(PRE_HEADERS),
    csvLine([
      '2026/11/02 5:40:12 p. m. GMT-3',
      'Lucía Martín',
      'Entre 7 y 8 horas',
      'Buena',
      'Poco cansancio',
      'Dolor inteno',
      'Nada de estres',
      'Muy Animada',
      'Si, molestia leve',
      'Rodilla derecha, al saltar',
      'Bien preparada',
      'Hoy salgo antes, tengo prueba mañana',
    ]),
    csvLine([
      '2026/11/02 5:52:03 p. m. GMT-3',
      'Ana Martinez',
      'Menos de 5 horas',
      'Muy mala',
      'Cansancio extremo',
      'Sin dolor muscular',
      'Estres extremo',
      'Desanimada',
      'No ninguna',
      '',
      'Poco preparada',
      '',
    ]),
  ].join('\n');

const RPE_CSV = [
  csvLine(['Marca temporal', 'Nombre', '¿Que tan intenso estuvo el entrenamiento?']),
  csvLine(['2026/11/02 8:31:00 p. m. GMT-3', 'Sofi', '8']),
  csvLine(['2026/11/02 8:35:00 p. m. GMT-3', 'Lucia Martin', '10']),
].join('\n');

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('reconocer preguntas', () => {
  it('identifica cada pregunta del formulario del profesor', () => {
    expect(PRE_HEADERS.map(fieldForHeader)).toEqual([
      'timestamp',
      'name',
      'sleepHours',
      'sleep',
      'fatigue',
      'soreness',
      'stress',
      'mood',
      'discomfort',
      'discomfortZone',
      'readiness',
      'note',
    ]);
    expect(fieldForHeader('¿Que tan intenso estuvo el entrenamiento?')).toBe('rpe');
    expect(fieldForHeader('Dirección de correo electrónico')).toBe('email');
  });

  it('convierte cada opción a su valor (5 = mejor), tolerando erratas', () => {
    expect(optionValue('sleepHours', 'Menos de 5 horas')).toBe(1);
    expect(optionValue('sleepHours', 'Mas de 8 horas')).toBe(5);
    expect(optionValue('sleep', 'Regular')).toBe(3);
    expect(optionValue('fatigue', 'Nada de cansancio')).toBe(5);
    expect(optionValue('fatigue', 'Cansancio extremo')).toBe(1);
    expect(optionValue('soreness', 'Dolor inteno')).toBe(2);
    expect(optionValue('soreness', 'Dolor muy intenso')).toBe(1);
    expect(optionValue('stress', 'Poco estres')).toBe(4);
    expect(optionValue('mood', 'Muy Animada')).toBe(5);
    expect(optionValue('mood', 'Desanimada')).toBe(2);
    expect(optionValue('readiness', 'Medianamente preparada')).toBe(3);
    expect(optionValue('discomfort', 'No ninguna')).toBe(0);
    expect(optionValue('discomfort', 'Si, dolor importante o lesion')).toBe(3);
    expect(optionValue('sleep', '4')).toBe(4);
    expect(optionValue('sleep', 'cualquier cosa')).toBeUndefined();
  });

  it('lee el RPE de 1 a 10', () => {
    expect(rpeValue('8')).toBe(8);
    expect(rpeValue(7)).toBe(7);
    expect(rpeValue('7 - Muy duro')).toBe(7);
    expect(rpeValue('10')).toBe(10);
    expect(rpeValue('11')).toBeUndefined();
    expect(rpeValue('')).toBeUndefined();
  });
});

describe('fechas de Google', () => {
  it('entiende la marca temporal de la descarga de Forms con zona horaria', () => {
    expect(new Date(parseTimestamp('2026/11/02 6:05:33 p. m. GMT-3')!).toISOString()).toBe('2026-11-02T21:05:33.000Z');
    expect(new Date(parseTimestamp('2026/11/02 12:10:00 a. m. GMT-3')!).toISOString()).toBe('2026-11-02T03:10:00.000Z');
  });

  it('entiende las fechas de la hoja de cálculo (hora local)', () => {
    expect(parseTimestamp('02/11/2026 18:05:33')).toBe(new Date(2026, 10, 2, 18, 5, 33).getTime());
    expect(parseTimestamp('11/02/2026 18:05:33', 'mdy')).toBe(new Date(2026, 10, 2, 18, 5, 33).getTime());
    expect(parseTimestamp('2026-11-02 18:05')).toBe(new Date(2026, 10, 2, 18, 5, 0).getTime());
    expect(parseTimestamp(new Date(2026, 10, 2, 9, 0))).toBe(new Date(2026, 10, 2, 9, 0).getTime());
    expect(parseTimestamp('hola')).toBeNull();
    expect(detectDateOrder(['11/25/2026 10:00:00', '11/02/2026 10:00'])).toBe('mdy');
    expect(detectDateOrder(['25/11/2026 10:00:00'])).toBe('dmy');
  });
});

describe('jugadoras', () => {
  it('reconoce nombres con o sin tildes, alias y nombres incompletos', () => {
    expect(matchPlayer('lucia martin', players)).toMatchObject({ player: { id: 'p1' }, method: 'exacto', doubtful: false });
    expect(matchPlayer('Sofi', players)).toMatchObject({ player: { id: 'p3' }, method: 'alias' });
    expect(matchPlayer('Ana Martinez', players)).toMatchObject({ player: { id: 'p2' }, doubtful: false });
    expect(matchPlayer('Lucia Martn', players)).toMatchObject({ player: { id: 'p1' }, method: 'parecido' });
    expect(matchPlayer('Camila Soto', players)).toMatchObject({ method: 'ninguno', doubtful: true });
  });

  it('reconoce la zona y el lado de la molestia', () => {
    expect(zoneFromText('Rodilla derecha, al saltar')).toEqual({ zone: 'Rodilla', side: 'derecha' });
    expect(zoneFromText('tobillo izq')).toEqual({ zone: 'Tobillo', side: 'izquierda' });
    expect(zoneFromText('me duele la pierna')).toEqual({ zone: 'Pierna / muslo', side: 'no aplica' });
    expect(zoneFromText('me duele la cabeza')).toEqual({ zone: 'Otra', side: 'no aplica' });
    expect(zoneFromText('espalda')).toEqual({ zone: 'Espalda lumbar', side: 'no aplica' });
  });
});

describe('archivo completo', () => {
  it('lee el CSV pre-entreno y coloca cada dato', async () => {
    const table = await readFormFile('respuestas.csv', buf(PRE_CSV));
    const form = detectForm(table, players);
    expect(form.kind).toBe('pre');
    const rows = parseRows(table, form, 'pre', players);
    expect(rows).toHaveLength(2);

    const lucia = rows[0];
    expect(lucia.match.player?.id).toBe('p1');
    expect(lucia.date).toBe('2026-11-02');
    expect(lucia.values).toEqual({
      wellness: { sleepHours: 4, sleep: 4, fatigue: 4, soreness: 2, stress: 5, mood: 5, readiness: 4 },
      discomfort: 1,
      discomfortZone: 'Rodilla derecha, al saltar',
      note: 'Hoy salgo antes, tengo prueba mañana',
    });
    expect(lucia.problems).toEqual([]);

    const ana = rows[1];
    expect(ana.match.player?.id).toBe('p2');
    expect(ana.values.wellness).toEqual({ sleepHours: 1, sleep: 1, fatigue: 1, soreness: 5, stress: 1, mood: 2, readiness: 2 });
    expect(ana.values.discomfort).toBe(0);
    expect(ana.values.note).toBeUndefined();
  });

  it('lee el .zip de «Descargar respuestas» y el formulario RPE', async () => {
    const zip = zipSync({ 'RPE (respuestas).csv': strToU8(RPE_CSV) });
    const table = await readFormFile('RPE.csv.zip', zip.buffer as ArrayBuffer);
    const form = detectForm(table, players);
    expect(form.kind).toBe('rpe');
    const rows = parseRows(table, form, 'rpe', players);
    expect(rows.map((r) => [r.match.player?.id, r.values.rpe])).toEqual([
      ['p3', 8],
      ['p1', 10],
    ]);
  });

  it('lee el .xlsx descargado de la hoja de cálculo (fechas como fecha de Excel)', async () => {
    const xlsx = await writeXlsxFile([
      [{ value: 'Marca temporal' }, { value: 'Nombre' }, { value: '¿Que tan intenso estuvo el entrenamiento?' }],
      [{ value: new Date(2026, 10, 2, 20, 31), type: Date, format: 'dd/mm/yyyy hh:mm:ss' }, { value: 'Sofía Rojas' }, { value: 7 }],
    ]).toBuffer();
    const table = await readFormFile('Respuestas.xlsx', xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer);
    const form = detectForm(table, players);
    expect(form.kind).toBe('rpe');
    const [row] = parseRows(table, form, 'rpe', players);
    expect(row.match.player?.id).toBe('p3');
    expect(row.values.rpe).toBe(7);
    expect(row.date).toBe('2026-11-02');
  });

  it('respeta las columnas corregidas a mano', async () => {
    const csv = [csvLine(['Marca temporal', 'Quién responde', 'Intensidad del entrenamiento']), csvLine(['2026/11/02 9:00:00 p. m. GMT-3', 'Lucía Martín', '6'])].join('\n');
    const table = await readFormFile('x.csv', buf(csv));
    // «Quién responde» no se reconoce por el enunciado, pero sí por los nombres de la columna.
    const auto = detectForm(table, players);
    expect(auto.columns.map((c) => c.field)).toEqual(['timestamp', 'name', 'rpe']);
    const saved = detectForm(table, players, { 'intensidad del entrenamiento': 'ignore' });
    expect(saved.columns[2]).toMatchObject({ field: 'ignore', auto: false });
  });
});

// Formato exacto del «Cuestionario Wellness U16A (Respuestas)» descargado de Hojas de cálculo:
// mismos encabezados (con espacios al final y la pregunta de estrés en dos líneas) y mismas opciones.
// Los nombres y respuestas son inventados.
const U16_CSV = `Marca temporal,Nombre de la jugadora,¿Cuanto dormiste anoche?,¿Como fue la calidad de tu sueño?,¿Qué nivel de fatiga o cansancio físico sientes hoy? ,¿Qué nivel de dolor muscular sientes hoy? ,"¿Cómo está tu nivel de estrés hoy? 
Considera el colegio, las pruebas, las preocupaciones personales y otras situaciones.",¿Cómo está tu estado de ánimo hoy? ,¿Tienes alguna molestia física o lesión que pueda afectar tu entrenamiento? ,"Si tienes alguna molestia, ¿en qué parte del cuerpo? ",¿Qué tan preparada te sientes para entrenar hoy? ,¿Hay algo que quieras comunicarle a tu entrenador antes de comenzar? 
29/10/2026 10:14:57,Lucía Martín,Entre 6 y 7 horas,Mala,Mucho cansancio,Dolor moderado,Mucho estrés,Muy desanimada,"No, ninguna.",,Medianamente preparada,
29/10/2026 16:30:17,Sofía Rojas,Más de 8 horas,Excelente,Nada de cansancio,Sin dolor muscular,Nada de estrés,Animada,"Sí, molestia moderada.","Rodilla izquierda, hombro derecho ",Totalmente preparada,nop 😄
2/11/2026 9:48:05,Ana María Martínez,Menos de 5 horas,Muy mala,Cansancio moderado,Dolor intenso,Poco estrés,Desanimada,"Sí, dolor importante o lesión.",Rodillaaaaaa ,Nada preparada,Que no voy a ir
2/11/2026 15:25:33,Lucía Martín,Entre 7 y 8 horas,Buena,Poco cansancio,Dolor leve,Estrés moderado,Normal,"Sí, molestia leve.",piernas ,Bien preparada,Antes del entrenamiento fui a fisico 
`;

describe('cuestionario Wellness U16A (formato real)', () => {
  it('reconoce todas las columnas, jugadoras y respuestas', async () => {
    const table = await readFormFile('Cuestionario Wellness U16A (Respuestas) - Respuestas de formulario 1.csv', buf(U16_CSV));
    expect(table.headers).toHaveLength(12);
    expect(table.rows).toHaveLength(4);
    const form = detectForm(table, players);
    expect(form.kind).toBe('pre');
    expect(form.dateOrder).toBe('dmy');
    expect(form.columns.map((c) => c.field)).toEqual([
      'timestamp',
      'name',
      'sleepHours',
      'sleep',
      'fatigue',
      'soreness',
      'stress',
      'mood',
      'discomfort',
      'discomfortZone',
      'readiness',
      'note',
    ]);

    const rows = parseRows(table, form, 'pre', players);
    expect(rows.every((r) => r.problems.length === 0)).toBe(true);
    expect(rows.map((r) => [r.match.player?.id, r.date])).toEqual([
      ['p1', '2026-10-29'],
      ['p3', '2026-10-29'],
      ['p2', '2026-11-02'],
      ['p1', '2026-11-02'],
    ]);
    expect(rows[2].submittedAt).toBe(new Date(2026, 10, 2, 9, 48, 5).getTime());

    expect(rows[0].values).toEqual({
      wellness: { sleepHours: 3, sleep: 2, fatigue: 2, soreness: 3, stress: 2, mood: 1, readiness: 3 },
      discomfort: 0,
    });
    expect(rows[1].values.wellness).toEqual({ sleepHours: 5, sleep: 5, fatigue: 5, soreness: 5, stress: 5, mood: 4, readiness: 5 });
    expect(rows[1].values.discomfort).toBe(2);
    // «nop 😄» no es un mensaje.
    expect(rows[1].values.note).toBeUndefined();
    expect(rows[2].values).toMatchObject({ discomfort: 3, discomfortZone: 'Rodillaaaaaa', note: 'Que no voy a ir' });
    expect(rows[2].values.wellness).toMatchObject({ sleepHours: 1, sleep: 1, soreness: 2, readiness: 1 });
    expect(rows[3].values.note).toBe('Antes del entrenamiento fui a fisico');
  });
});

describe('mensajes y zonas como los escriben las jugadoras', () => {
  it('descarta los «no» y detecta quien avisa que no viene', () => {
    for (const t of ['No nada', 'Nopp', 'nop 😄', 'nop', 'Nop', 'no', 'Nada ', 'ninguna', '']) expect(meaningfulNote(t)).toBeUndefined();
    expect(meaningfulNote('Ya le dije 🫰🏻')).toBe('Ya le dije 🫰🏻');
    expect(meaningfulNote('Que no voy a ir')).toBe('Que no voy a ir');
    expect(saysNotComing('Que no voy a ir')).toBe(true);
    expect(saysNotComing('hoy no voy a entrenar')).toBe(true);
    expect(saysNotComing('No voy por la rodilla cueck')).toBe(true);
    expect(saysNotComing('Antes del entrenamiento fui a fisico')).toBe(false);
    expect(saysNotComing('q a medida q pasa el entreno me duele mas la rodilla')).toBe(false);
  });

  it('separa varias zonas, cada una con su lado', () => {
    expect(zonesFromText('Rodilla izquierda, hombro derecho ')).toEqual([
      { zone: 'Rodilla', side: 'izquierda' },
      { zone: 'Hombro', side: 'derecha' },
    ]);
    expect(zonesFromText('tobillo y espalda baja')).toEqual([
      { zone: 'Tobillo', side: 'no aplica' },
      { zone: 'Espalda lumbar', side: 'no aplica' },
    ]);
    expect(zonesFromText('Rodillas y espalda')).toEqual([
      { zone: 'Rodilla', side: 'ambos' },
      { zone: 'Espalda lumbar', side: 'no aplica' },
    ]);
    expect(zonesFromText('en los muslos y tobillo ')).toEqual([
      { zone: 'Pierna / muslo', side: 'ambos' },
      { zone: 'Tobillo', side: 'no aplica' },
    ]);
    expect(zonesFromText('Rodillaaaaaa ')).toEqual([{ zone: 'Rodilla', side: 'no aplica' }]);
    expect(zonesFromText('en las dos rodillas')).toEqual([{ zone: 'Rodilla', side: 'ambos' }]);
    expect(zonesFromText('La pierna izquierda y que estoy enferma ')).toEqual([{ zone: 'Pierna / muslo', side: 'izquierda' }]);
    expect(zonesFromText('Rodilla 😔')).toEqual([{ zone: 'Rodilla', side: 'no aplica' }]);
  });
});

describe('aplicar a entrenamientos', () => {
  const base = { teamId: 't', date: '2026-11-02', type: 'entrenamiento', mode: 'vivo' } as const;
  const morning: Session = { ...base, id: 's1', status: 'finalizado', startedAt: new Date(2026, 10, 2, 9).getTime() };
  const evening: Session = { ...base, id: 's2', status: 'en_curso', startedAt: new Date(2026, 10, 2, 18).getTime() };

  it('elige la sesión del día según la hora de respuesta', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m).getTime();
    expect(pickSession([evening], 'pre', at(10))?.id).toBe('s2');
    expect(pickSession([morning, evening], 'pre', at(8))?.id).toBe('s1');
    expect(pickSession([morning, evening], 'pre', at(17, 40))?.id).toBe('s2');
    expect(pickSession([morning, evening], 'rpe', at(11))?.id).toBe('s1');
    expect(pickSession([morning, evening], 'rpe', at(20, 30))?.id).toBe('s2');
    expect(pickSession([], 'pre', at(10))).toBeUndefined();
  });

  it('rellena la asistencia sin perder lo que ya había', () => {
    const att: Attendance = { sessionId: 's2', playerId: 'p1', status: 'presente', manualJumps: 0, jumps: 0, rpe: 5 };
    expect(
      attendanceChanges(att, {
        kind: 'pre',
        submittedAt: 1,
        values: { wellness: { sleep: 4, fatigue: 4, soreness: 2, stress: 5, mood: 5 }, discomfort: 1, note: 'hola' },
      }),
    ).toEqual({ preFormAt: 1, playerNote: 'hola', discomfort: 1, wellness: { sleep: 4, fatigue: 4, soreness: 2, stress: 5, mood: 5 } });
    // Wellness incompleto y sin uno previo: no se guarda a medias.
    expect(attendanceChanges(att, { kind: 'pre', submittedAt: 2, values: { wellness: { mood: 3 } } }).wellness).toBeUndefined();
    expect(attendanceChanges(att, { kind: 'rpe', submittedAt: 3, values: { rpe: 8 } })).toEqual({ rpe: 8, rpeFormAt: 3 });
  });
});
