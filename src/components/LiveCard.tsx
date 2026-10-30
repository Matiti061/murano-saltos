import { HeartPulse, Minus } from 'lucide-react';
import type { Attendance, Player } from '../db/types';
import type { LimitState } from '../lib/metrics';
import { NumberBubble } from './PlayerBits';
import { cx } from './ui';

const STATE_STYLES: Record<LimitState, string> = {
  none: 'border-slate-200 bg-white',
  ok: 'border-slate-200 bg-white',
  warn: 'border-amber-400 bg-amber-50',
  over: 'border-red-500 bg-red-50',
};

const BAR_STYLES: Record<LimitState, string> = {
  none: 'bg-indigo-500',
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  over: 'bg-red-600',
};

export function LiveCard({
  player,
  attendance,
  blockJumps,
  showBlock,
  limit,
  state,
  flashKey,
  hasComplaint,
  onTap,
  onMinus,
  onComplaint,
}: {
  player: Player;
  attendance: Attendance;
  blockJumps: number;
  showBlock: boolean;
  limit?: number;
  state: LimitState;
  flashKey: number;
  hasComplaint: boolean;
  onTap: () => void;
  onMinus: () => void;
  onComplaint: () => void;
}) {
  const pct = limit ? Math.min(100, (attendance.jumps / limit) * 100) : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Sumar salto a ${player.name}`}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      className={cx(
        'no-select relative flex min-h-[150px] cursor-pointer flex-col rounded-2xl border-2 p-3 shadow-sm transition-colors outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 active:bg-indigo-50',
        STATE_STYLES[state],
      )}
    >
      {flashKey > 0 && <span key={flashKey} className="tap-flash pointer-events-none absolute inset-0 rounded-2xl" />}
      <div className="flex items-start gap-2">
        <NumberBubble player={player} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-tight font-bold break-words text-slate-900 sm:text-base">{player.name}</p>
          <p className="truncate text-xs text-slate-500">
            {player.position}
            {attendance.status === 'parcial' ? ' · parcial' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onComplaint();
          }}
          className={cx(
            'rounded-lg p-1.5',
            hasComplaint ? 'bg-red-100 text-red-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
          )}
          aria-label={`Registrar molestia de ${player.name}`}
        >
          <HeartPulse size={18} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <span className={cx('text-5xl font-black tabular-nums', state === 'over' ? 'text-red-700' : 'text-slate-900')}>
          {attendance.jumps}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1 text-xs text-slate-500">
          {showBlock && <p className="font-semibold text-indigo-700 tabular-nums">Ejercicio: {blockJumps}</p>}
          {limit ? (
            <>
              <p className="tabular-nums">
                {attendance.jumps} / {limit}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={cx('h-full rounded-full transition-all', BAR_STYLES[state])} style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMinus();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 active:bg-slate-200"
          aria-label={`Quitar un salto a ${player.name}`}
        >
          <Minus size={20} />
        </button>
      </div>
    </div>
  );
}
