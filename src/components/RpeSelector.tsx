import { RPE_LABELS } from '../lib/metrics';
import { cx } from './ui';

const RPE_COLORS = [
  'bg-sky-100 text-sky-900',
  'bg-sky-200 text-sky-900',
  'bg-emerald-200 text-emerald-900',
  'bg-emerald-300 text-emerald-900',
  'bg-lime-300 text-lime-900',
  'bg-yellow-300 text-yellow-900',
  'bg-amber-300 text-amber-900',
  'bg-orange-400 text-orange-950',
  'bg-orange-500 text-white',
  'bg-red-500 text-white',
  'bg-red-700 text-white',
];

export function rpeColor(rpe: number) {
  return RPE_COLORS[Math.max(0, Math.min(10, Math.round(rpe)))];
}

/** Escala CR-10 de Borg: 0 (reposo) a 10 (máximo). */
export function RpeSelector({
  value,
  onChange,
  compact,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            title={RPE_LABELS[i]}
            onClick={() => onChange(value === i ? undefined : i)}
            className={cx(
              'rounded-lg font-bold tabular-nums transition-all',
              compact ? 'h-9 text-sm' : 'h-12 text-base',
              value === i ? cx(rpeColor(i), 'ring-2 ring-slate-900 ring-offset-1') : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {i}
          </button>
        ))}
      </div>
      {!compact && (
        <p className="mt-1 h-5 text-center text-sm font-medium text-slate-600">{value != null ? RPE_LABELS[value] : 'Sin valorar'}</p>
      )}
    </div>
  );
}
