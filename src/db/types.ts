export type Position = 'Colocadora' | 'Opuesta' | 'Receptora' | 'Central' | 'Líbero';
export const POSITIONS: Position[] = ['Colocadora', 'Opuesta', 'Receptora', 'Central', 'Líbero'];

export type PlayerStatus = 'activa' | 'readaptacion' | 'lesionada' | 'baja';
export const PLAYER_STATUS_LABEL: Record<PlayerStatus, string> = {
  activa: 'Activa',
  readaptacion: 'Readaptación',
  lesionada: 'Lesionada',
  baja: 'Baja',
};

export type SessionType = 'entrenamiento' | 'partido' | 'fisico';
export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  fisico: 'Físico',
};

export type SessionStatus = 'en_curso' | 'finalizado';
export type SessionMode = 'vivo' | 'manual';

export type AttendanceStatus = 'presente' | 'ausente' | 'lesionada' | 'parcial';
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  parcial: 'Parcial',
  ausente: 'Ausente',
  lesionada: 'Lesionada',
};

/** Cada ítem va de 1 a 5, donde 5 es siempre lo mejor. */
export interface Wellness {
  sleep: number;
  fatigue: number;
  soreness: number;
  stress: number;
}

export interface Team {
  id?: number;
  name: string;
  demo?: boolean;
  createdAt: number;
}

export interface Player {
  id?: number;
  teamId: number;
  name: string;
  number?: number;
  position: Position;
  status: PlayerStatus;
  /** Límite de saltos por sesión (opcional). */
  jumpLimit?: number;
  notes?: string;
  /** 0 | 1 porque IndexedDB no indexa booleanos. */
  archived: 0 | 1;
  createdAt: number;
}

export interface Session {
  id?: number;
  teamId: number;
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
  id?: number;
  sessionId: number;
  playerId: number;
  status: AttendanceStatus;
  minutes?: number;
  rpe?: number;
  wellness?: Wellness;
  /** Saltos registrados a mano (registro manual o corrección posterior). Puede ser negativo. */
  manualJumps: number;
  /** Total de saltos = eventos + manualJumps. Se recalcula en cada cambio. */
  jumps: number;
  /** Límite específico para esta sesión (si no, se usa el de la jugadora). */
  jumpLimit?: number;
}

export interface Block {
  id?: number;
  sessionId: number;
  name: string;
  order: number;
  startedAt: number;
  endedAt?: number;
}

export interface JumpEvent {
  id?: number;
  sessionId: number;
  playerId: number;
  blockId?: number;
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
  'Otra',
];

export interface Complaint {
  id?: number;
  playerId: number;
  sessionId?: number;
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
  createdAt: number;
}

export interface Settings {
  id: 'main';
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
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
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
