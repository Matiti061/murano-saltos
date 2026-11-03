import type { ReactNode } from 'react';
import { useSettings } from '../db/settings';
import type { Wellness } from '../db/types';
import { DISCOMFORT_LABEL } from '../lib/forms/zones';
import { averageScore, isLowAnswer, itemScore, scoreTone, WELLNESS_QUESTIONS, wellnessScore } from '../lib/metrics';
import { cx } from './ui';

const CELL_TONES = {
  red: 'bg-red-100 text-red-900',
  amber: 'bg-amber-100 text-amber-900',
  green: 'bg-emerald-50 text-emerald-900',
  slate: 'bg-slate-50 text-slate-400',
};

export interface WellnessGridRow {
  key: string;
  /** Primera columna: la jugadora o la fecha. */
  label: ReactNode;
  wellness?: Partial<Wellness>;
  discomfort?: number;
  discomfortZone?: string;
  note?: string;
}

/** Nota general 1-10 con su color. */
export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  if (score == null) return <span className="text-slate-400">–</span>;
  return (
    <span className={cx('inline-flex min-w-12 justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums', CELL_TONES[scoreTone(score)], className)}>
      {score}/10
    </span>
  );
}

/**
 * Tabla con lo que respondió cada jugadora, pregunta por pregunta: el texto de la opción
 * y su nota de 1 a 10. En rojo lo que está en zona de alerta, en ámbar lo regular.
 */
export function WellnessGrid({
  rows,
  labelHeader = 'Jugadora',
  showAverage,
  showNotes,
}: {
  rows: WellnessGridRow[];
  labelHeader?: string;
  /** Fila final con la media de cada pregunta. */
  showAverage?: boolean;
  /** Columna con el mensaje al entrenador. */
  showNotes?: boolean;
}) {
  const settings = useSettings();
  const hasDiscomfort = rows.some((r) => r.discomfort != null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">{labelHeader}</th>
            <th className="bg-slate-50 px-2 py-2 text-center">General</th>
            {WELLNESS_QUESTIONS.map((q) => (
              <th key={q.key} className="bg-slate-50 px-1.5 py-2 text-center whitespace-nowrap">
                {q.short}
              </th>
            ))}
            {hasDiscomfort && <th className="bg-slate-50 px-2 py-2 text-center">Molestia</th>}
            {showNotes && <th className="bg-slate-50 px-3 py-2 text-left">Mensaje</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5">{r.label}</td>
              <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                <ScoreBadge score={wellnessScore(r.wellness)} />
              </td>
              {WELLNESS_QUESTIONS.map((q) => {
                const v = r.wellness?.[q.key];
                const tone = v == null ? 'slate' : isLowAnswer(q.key, v, settings.wellnessItemAlert) ? 'red' : itemScore(v) <= 6 ? 'amber' : 'green';
                return (
                  <td key={q.key} className="border-b border-slate-100 px-1 py-1.5">
                    <div className={cx('min-w-[5.5rem] rounded-lg px-1.5 py-1 text-center leading-tight', CELL_TONES[tone])}>
                      {v == null ? (
                        '–'
                      ) : (
                        <>
                          <div className="text-xs font-medium">{q.options[v - 1]}</div>
                          <div className="text-[11px] font-bold tabular-nums">{itemScore(v)}/10</div>
                        </>
                      )}
                    </div>
                  </td>
                );
              })}
              {hasDiscomfort && (
                <td className="border-b border-slate-100 px-1 py-1.5">
                  <div
                    className={cx(
                      'min-w-[6.5rem] rounded-lg px-1.5 py-1 text-center text-xs leading-tight font-medium',
                      CELL_TONES[r.discomfort == null ? 'slate' : !r.discomfort ? 'green' : r.discomfort >= 3 ? 'red' : 'amber'],
                    )}
                  >
                    {r.discomfort == null ? '–' : DISCOMFORT_LABEL[r.discomfort]}
                    {r.discomfort && r.discomfortZone ? <div className="font-normal">{r.discomfortZone}</div> : null}
                  </div>
                </td>
              )}
              {showNotes && (
                <td className="min-w-[12rem] border-b border-slate-100 px-3 py-1.5 text-xs text-slate-700">{r.note ? `«${r.note}»` : ''}</td>
              )}
            </tr>
          ))}
        </tbody>
        {showAverage && rows.length > 1 && (
          <tfoot>
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-orange-50 px-3 py-2 text-orange-900">Media del equipo</td>
              <td className="bg-orange-50 px-2 py-2 text-center">
                <ScoreBadge score={averageScore(rows.map((r) => r.wellness), null)} />
              </td>
              {WELLNESS_QUESTIONS.map((q) => {
                const avg = averageScore(rows.map((r) => r.wellness), q.key);
                return (
                  <td key={q.key} className="bg-orange-50 px-1 py-2 text-center text-sm tabular-nums">
                    {avg != null ? `${avg}/10` : '–'}
                  </td>
                );
              })}
              {hasDiscomfort && <td className="bg-orange-50" />}
              {showNotes && <td className="bg-orange-50" />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
