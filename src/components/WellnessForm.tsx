import type { Wellness } from '../db/types';
import { itemScore, WELLNESS_ITEMS, WELLNESS_QUESTIONS } from '../lib/metrics';
import { cx } from './ui';

const SCALE_COLORS = ['', 'bg-red-500 text-white', 'bg-orange-400 text-white', 'bg-yellow-300 text-yellow-950', 'bg-lime-400 text-lime-950', 'bg-emerald-500 text-white'];

export const EMPTY_WELLNESS: Partial<Wellness> = {};

export function isWellnessComplete(w: Partial<Wellness> | undefined): w is Wellness {
  return !!w && WELLNESS_ITEMS.every((i) => typeof w[i.key] === 'number');
}

const REQUIRED = new Set<string>(WELLNESS_ITEMS.map((i) => i.key));

/**
 * Cuestionario con las mismas preguntas y opciones que la encuesta de Google Forms.
 * Calidad del sueño, fatiga, dolor muscular y estrés son obligatorias; el resto, opcionales.
 * Se guarda de 1 a 5 y cada opción muestra su nota de 1 a 10.
 */
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
      {WELLNESS_QUESTIONS.map((item) => {
        const optional = !REQUIRED.has(item.key);
        return (
          <div key={item.key}>
            <div className="mb-1.5">
              <span className={cx('font-semibold text-slate-800', large ? 'text-lg' : 'text-sm')}>
                {item.label}
                {optional && <span className="ml-1.5 text-xs font-normal text-slate-400">(opcional)</span>}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ ...value, [item.key]: optional && value[item.key] === n ? undefined : n })}
                  className={cx(
                    'flex flex-col items-center justify-center rounded-xl px-1 leading-tight transition-all',
                    large ? 'min-h-20 py-2' : 'min-h-14 py-1.5',
                    value[item.key] === n ? cx(SCALE_COLORS[n], 'ring-2 ring-slate-900 ring-offset-1') : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  <span className={cx('font-bold tabular-nums', large ? 'text-2xl' : 'text-base')}>{itemScore(n)}</span>
                  <span className={cx('font-medium', large ? 'text-xs' : 'text-[10px]')}>{item.options[n - 1]}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
