import { PLAYER_STATUS_LABEL, type Player, type PlayerStatus } from '../db/types';
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

const POSITION_COLORS: Record<string, string> = {
  Colocadora: 'bg-violet-600',
  Opuesta: 'bg-rose-600',
  Receptora: 'bg-sky-600',
  Central: 'bg-amber-600',
  Líbero: 'bg-emerald-600',
};

export function NumberBubble({ player, size = 'md' }: { player: Pick<Player, 'number' | 'position'>; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white tabular-nums',
        POSITION_COLORS[player.position] ?? 'bg-slate-600',
        size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-sm',
      )}
    >
      {player.number ?? '–'}
    </span>
  );
}
