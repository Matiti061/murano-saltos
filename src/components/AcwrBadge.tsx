import { fmtNum } from '../lib/format';
import { ACWR_LABEL, type AcwrResult, type AcwrStatus } from '../lib/metrics';
import { Badge, type BadgeTone } from './ui';

export const ACWR_TONE: Record<AcwrStatus, BadgeTone> = {
  insuficiente: 'slate',
  bajo: 'blue',
  optimo: 'green',
  alto: 'amber',
  muy_alto: 'red',
};

export function AcwrBadge({ result, showLabel }: { result: AcwrResult; showLabel?: boolean }) {
  const title =
    result.status === 'insuficiente'
      ? `Hacen falta al menos 3 semanas de datos (hay ${result.daysOfData} días).`
      : `Últimos 7 días: ${fmtNum(result.acute)} · Media semanal (28 días): ${fmtNum(result.chronicWeekly, 1)}`;
  return (
    <span title={title}>
      <Badge tone={ACWR_TONE[result.status]}>
        {result.ratio != null ? fmtNum(result.ratio, 2) : '–'}
        {showLabel && <span className="font-medium">· {ACWR_LABEL[result.status]}</span>}
      </Badge>
    </span>
  );
}
