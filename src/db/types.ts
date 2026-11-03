export type Position = 'Armadora' | 'Punta receptora' | 'Opuesta' | 'Central' | 'Líbero';
/** Orden en el que se muestran las jugadoras en toda la app. */
export const POSITIONS: Position[] = ['Armadora', 'Punta receptora', 'Opuesta', 'Central', 'Líbero'];

export const POSITION_PLURAL: Record<Position, string> = {
  Armadora: 'Armadoras',
  'Punta receptora': 'Puntas receptoras',
  Opuesta: 'Opuestas',
  Central: 'Centrales',
  Líbero: 'Líberos',
};

export const POSITION_SHORT: Record<Position, string> = {
  Armadora: 'AR',
  'Punta receptora': 'PR',
  Opuesta: 'OP',
  Central: 'CE',
  Líbero: 'LI',
};

/** Nombres de posición de versiones anteriores de la app. */
const LEGACY_POSITIONS: Record<string, Position> = {
  Colocadora: 'Armadora',
  Receptora: 'Punta receptora',
};

export function normalizePosition(position: string): Position {
  if ((POSITIONS as string[]).includes(position)) return position as Position;
  return LEGACY_POSITIONS[position] ?? 'Punta receptora';
}

/** Adapta una jugadora guardada con una versión anterior: posiciones nuevas y sin dorsal. */
export function normalizeLegacyPlayer<T extends { position: string; number?: unknown }>(player: T): T {
  player.position = normalizePosition(player.position);
  delete player.number;
  return player;
}

/** Ordena por posición y, dentro de cada posición, por nombre. */
export function comparePlayers(a: Pick<Player, 'position' | 'name'>, b: Pick<Player, 'position' | 'name'>) {
  return POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || a.name.localeCompare(b.name, 'es');
}

export type PlayerStatus = 'activa' | 'readaptacion' | 'lesionada' | 'baja';
export const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  activa: 'Activa',
  readaptacion: 'Readaptación',
  lesionada: 'Lesionada',
  baja: 'Baja',
};

/** «partido» ya no se puede elegir; se mantiene solo para mostrar datos antiguos. */
export type SessionType = 'entrenamiento' | 'partido' | 'fisico';
export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  fisico: 'Físico',
};
export const SELECTABLE_SESSION_TYPES: SessionType[] = ['entrenamiento', 'fisico'];

export type SessionStatus = 'en_curso' | 'finalizado';
export type SessionMode = 'vivo' | 'manual';

export type AttendanceStatus = 'presente' | 'ausente' | 'lesionada' | 'parcial';
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  parcial: 'Parcial',
  ausente: 'Ausente',
  lesionada: 'Lesionada',
};

/**
 * Cada ítem va de 1 a 5, donde 5 es siempre lo mejor. El total /20 usa solo los 4 primeros
 * (sueño = calidad del sueño); los demás vienen del formulario del profesor y son opcionales.
 */
export interface Wellness {
  sleep: number;
  fatigue: number;
  soreness: number;
  stress: number;
  /** Horas dormidas: 1 = menos de 5 h … 5 = más de 8 h. */
  sleepHours?: number;
  mood?: number;
  /** Qué tan preparada se siente para entrenar. */
  readiness?: number;
}

export interface Team {
  id?: string;
  name: string;
  demo?: boolean;
  createdAt: number;
}

export interface Player {
  id?: string;
  teamId: string;
  name: string;
  position: Position;
  status: PlayerStatus;
  /** Límite de saltos por sesión (opcional). */
  jumpLimit?: number;
  notes?: string;
  /** Otros nombres con los que aparece en los formularios de Google (se aprenden al importar). */
  aliases?: string[];
  /** 0 | 1 porque IndexedDB no indexa booleanos. */
  archived: 0 | 1;
  createdAt: number;
}

export interface Session {
  id?: string;
  teamId: string;
  /** yyyy-MM-dd */
  date: string;
  type: SessionType;
  status: SessionStatus;
  mode: SessionMode;
  startedAt: number;
  endedAt?: number;
  durationMin?: number;
  notes?: string;
}

export interface Attendance {
  id?: string;
  sessionId: string;
  playerId: string;
  status: AttendanceStatus;
  minutes?: number;
  rpe?: number;
  wellness?: Wellness;
  /** Saltos registrados a mano (registro manual o corrección posterior). Puede ser negativo. */
  manualJumps: number;
  /**
   * Saltos ya compactados por ejercicio (clave = id del ejercicio o NO_BLOCK).
   * Al finalizar una sesión los toques individuales se resumen aquí para ocupar poco en la nube.
   */
  blockJumps?: Record<string, number>;
  /** Total de saltos = compactados + toques pendientes + manualJumps. Se recalcula en cada cambio. */
  jumps: number;
  /** Límite específico para esta sesión (si no, se usa el de la jugadora). */
  jumpLimit?: number;
  /** Mensaje de la jugadora al entrenador (formulario pre-entreno). */
  playerNote?: string;
  /** Molestia declarada antes de entrenar: 0 ninguna, 1 leve, 2 moderada, 3 dolor importante o lesión. */
  discomfort?: number;
  /** Hora de las respuestas de formulario aplicadas a esta asistencia. */
  preFormAt?: number;
  rpeFormAt?: number;
}

export type FormKind = 'pre' | 'rpe';
export const FORM_KIND_LABEL: Record<FormKind, string> = {
  pre: 'Pre-entrenamiento',
  rpe: 'RPE (post-entrenamiento)',
};

/** Valores normalizados de una respuesta de formulario. */
export interface FormValues {
  wellness?: Partial<Wellness>;
  discomfort?: number;
  discomfortZone?: string;
  note?: string;
  rpe?: number;
}

/** Una respuesta de Google Forms ya identificada con su jugadora. */
export interface FormResponse {
  id?: string;
  teamId: string;
  playerId: string;
  /** yyyy-MM-dd de la respuesta. */
  date: string;
  kind: FormKind;
  submittedAt: number;
  values: FormValues;
  /** Texto original por pregunta, para consultarlo tal cual. */
  raw: Record<string, string>;
  /** Sesión a la que se aplicó (si ya existía). */
  sessionId?: string;
  importedAt: number;
}

export interface Block {
  id?: string;
  sessionId: string;
  name: string;
  order: number;
  startedAt: number;
  endedAt?: number;
}

export interface JumpEvent {
  id?: string;
  sessionId: string;
  playerId: string;
  blockId?: string;
  ts: number;
}

export type ComplaintKind = 'molestia' | 'lesion';
export type Side = 'izquierda' | 'derecha' | 'ambos' | 'no aplica';
export const SIDES: Side[] = ['izquierda', 'derecha', 'ambos', 'no aplica'];
export const BODY_ZONES = [
  'Rodilla',
  'Tobillo',
  'Hombro',
  'Espalda lumbar',
  'Espalda dorsal',
  'Cadera / ingle',
  'Isquiotibiales',
  'Cuádriceps',
  'Gemelo / Aquiles',
  'Pie',
  'Mano / dedos',
  'Codo / muñeca',
  'Cuello',
  'Pierna / muslo',
  'Otra',
];

export interface Complaint {
  id?: string;
  playerId: string;
  sessionId?: string;
  /** yyyy-MM-dd */
  date: string;
  zone: string;
  side: Side;
  intensity: number;
  kind: ComplaintKind;
  description?: string;
  physioNotes?: string;
  /** yyyy-MM-dd cuando se da por resuelta. */
  resolvedDate?: string;
  /** Si la creó la importación de un formulario pre-entreno (para actualizarla sin duplicar). */
  fromForm?: boolean;
  createdAt: number;
}

export interface Settings {
  id?: string;
  clubName: string;
  logoDataUrl?: string;
  acwrLow: number;
  acwrHigh: number;
  acwrVeryHigh: number;
  /** Un ítem de wellness igual o por debajo de este valor genera alerta. */
  wellnessItemAlert: number;
  /** Porcentaje del límite a partir del cual la tarjeta se pone ámbar. */
  limitWarnPct: number;
  exercises: string[];
  lastBackupAt?: number;
  /** Correcciones de columnas de los formularios: texto normalizado de la pregunta → campo. */
  formColumnMap?: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  clubName: 'Club Voleibol Murano',
  acwrLow: 0.8,
  acwrHigh: 1.3,
  acwrVeryHigh: 1.5,
  wellnessItemAlert: 2,
  limitWarnPct: 80,
  exercises: [
    'Calentamiento',
    'Técnica de ataque',
    'Bloqueo',
    'Saque',
    'Recepción',
    'Defensa',
    'Colocación',
    'Complejo 1',
    'Complejo 2',
    '6x6',
    'Físico / pliometría',
  ],
};
