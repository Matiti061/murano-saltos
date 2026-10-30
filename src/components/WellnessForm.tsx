import type { Wellness } from '../db/types';
import { WELLNESS_ITEMS } from '../lib/metrics';
import { cx } from './ui';

const SCALE_COLORS = ['', 'bg-red-500 text-white', 'bg-orange-400 text-white', 'bg-yellow-300 text-yellow-950', 'bg-lime-400 text-lime-950', 'bg-emerald-500 text-white'];

export const EMPTY_WELLNESS: Partial<Wellness> = {};

export function isWellnessComplete(w: Partial<Wellness> | undefined): w is Wellness {
  return !!w && WELLNESS_ITEMS.every((i) => typeof w[i.key] === 'number');
}

/** Cuestionario de 4 ítems (1 = peor, 5 = mejor). */
export function WellnessForm({
  value,
  onChange,
  large,
}: {
  value: Partial<Wellness>;
  onChange: (w: Partial<Wellness>) => void;
  large?: boolean;
}) {
  return (
    <div className="space-y-4">
      {WELLNESS_ITEMS.map((item) => (
        <div key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className={cx('font-semibold text-slate-800', large ? 'text-lg' : 'text-sm')}>{item.label}</span>
            <span className="text-xs text-slate-500">
              1 = {item.low.toLowerCase()} · 5 = {item.high.toLowerCase()}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ ...value, [item.key]: n })}
                className={cx(
                  'rounded-xl font-bold transition-all',
                  large ? 'h-16 text-2xl' : 'h-11 text-base',
                  value[item.key] === n ? cx(SCALE_COLORS[n], 'ring-2 ring-slate-900 ring-offset-1') : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
