import type { ReactNode } from 'react';
import { PLAYER_STATUS_LABEL, POSITION_PLURAL, POSITION_SHORT, type Player, type PlayerStatus, type Position } from '../db/types';
import { Badge, cx, type BadgeTone } from './ui';

const STATUS_TONE: Record<PlayerStatus, BadgeTone> = {
  activa: 'green',
  readaptacion: 'amber',
  lesionada: 'red',
  baja: 'slate',
};

export function StatusBadge({ status }: { status: PlayerStatus }) {
  if (status === 'activa') return null;
  return <Badge tone={STATUS_TONE[status]}>{PLAYER_STATUS_LABEL[status]}</Badge>;
}

/** Colores fijos por posición, distintos del naranjo de la marca. */
export const POSITION_COLORS: Record<Position, string> = {
  Armadora: 'bg-violet-600',
  'Punta receptora': 'bg-sky-600',
  Opuesta: 'bg-rose-600',
  Central: 'bg-teal-600',
  Líbero: 'bg-slate-600',
};

/** Círculo con la abreviatura de la posición (AR, PR, OP, CE, LI). */
export function PositionBubble({ player, size = 'md' }: { player: Pick<Player, 'position'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      title={player.position}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        POSITION_COLORS[player.position] ?? 'bg-slate-600',
        size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-xs',
      )}
    >
      {POSITION_SHORT[player.position] ?? '?'}
    </span>
  );
}

/** Encabezado de grupo por posición (p. ej. «Armadoras · 2»). */
export function PositionHeader({ position, count, action }: { position: Position; count: number; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cx('h-3 w-3 rounded-full', POSITION_COLORS[position])} />
      <h3 className="text-sm font-bold tracking-wide text-slate-700 uppercase">{POSITION_PLURAL[position]}</h3>
      <span className="text-sm text-slate-400">{count}</span>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
