import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtNum } from '../lib/format';
import type { AcwrThresholds } from '../lib/metrics';

/** Colores de la paleta validada (serie 1/2) y de estado. */
export const VIZ = {
  series1: '#2a78d6',
  series2: '#eb6834',
  grid: '#e8e8e4',
  axis: '#52514e',
  muted: '#8a8984',
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  low: '#86b6ef',
};

const axisProps = {
  tick: { fill: VIZ.axis, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: VIZ.grid },
} as const;

export interface ChartDatum {
  label: string;
  value: number | null;
  /** Texto largo para el tooltip (p. ej. fecha completa). */
  detail?: string;
}

function ChartTooltip({
  active,
  payload,
  unit,
  decimals = 0,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  unit: string;
  decimals?: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartDatum;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{d.detail ?? d.label}</p>
      <p className="text-slate-600 tabular-nums">
        {d.value == null ? 'Sin datos' : `${fmtNum(d.value, decimals)} ${unit}`}
      </p>
    </div>
  );
}

export function ChartCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function NoChartData() {
  return <p className="py-10 text-center text-sm text-slate-400">Aún no hay datos suficientes.</p>;
}

export function ColumnChart({
  data,
  unit,
  limit,
  color = VIZ.series1,
  height = 220,
  decimals = 0,
}: {
  data: ChartDatum[];
  unit: string;
  limit?: number;
  color?: string;
  height?: number;
  decimals?: number;
}) {
  if (data.length === 0) return <NoChartData />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} unit={unit} decimals={decimals} />} />
        {limit ? (
          <ReferenceLine
            y={limit}
            stroke={VIZ.critical}
            strokeWidth={1.5}
            label={{ value: `Límite ${limit}`, position: 'insideTopRight', fill: VIZ.axis, fontSize: 11 }}
          />
        ) : null}
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontales, para comparar jugadoras. */
export function HBarChart({ data, unit, color = VIZ.series1 }: { data: ChartDatum[]; unit: string; color?: string }) {
  if (data.length === 0) return <NoChartData />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={VIZ.grid} />
        <XAxis type="number" {...axisProps} allowDecimals={false} />
        <YAxis type="category" dataKey="label" {...axisProps} width={110} interval={0} />
        <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} unit={unit} />} />
        <Bar
          dataKey="value"
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          isAnimationActive={false}
          label={{ position: 'right', fill: VIZ.axis, fontSize: 11 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({
  data,
  unit,
  domain,
  color = VIZ.series1,
  height = 200,
}: {
  data: ChartDatum[];
  unit: string;
  domain?: [number, number];
  color?: string;
  height?: number;
}) {
  if (data.filter((d) => d.value != null).length < 2) return <NoChartData />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} domain={domain ?? ['auto', 'auto']} width={44} />
        <Tooltip cursor={{ stroke: VIZ.muted, strokeWidth: 1 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} unit={unit} />} />
        <Line
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Evolución del ACWR con las zonas de riesgo de fondo. */
export function AcwrChart({ data, th, height = 220 }: { data: ChartDatum[]; th: AcwrThresholds; height?: number }) {
  if (data.filter((d) => d.value != null).length < 2) {
    return <p className="py-10 text-center text-sm text-slate-400">El ACWR necesita al menos 3 semanas de datos.</p>;
  }
  const max = Math.max(2, th.acwrVeryHigh + 0.3, ...data.map((d) => d.value ?? 0));
  const top = Math.ceil(max * 10) / 10;
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <ReferenceArea y1={0} y2={th.acwrLow} fill={VIZ.low} fillOpacity={0.12} />
          <ReferenceArea y1={th.acwrLow} y2={th.acwrHigh} fill={VIZ.good} fillOpacity={0.1} />
          <ReferenceArea y1={th.acwrHigh} y2={th.acwrVeryHigh} fill={VIZ.warning} fillOpacity={0.14} />
          <ReferenceArea y1={th.acwrVeryHigh} y2={top} fill={VIZ.critical} fillOpacity={0.1} />
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...axisProps} domain={[0, top]} width={44} tickFormatter={(v: number) => fmtNum(v, 1)} />
          <Tooltip cursor={{ stroke: VIZ.muted, strokeWidth: 1 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} unit="" decimals={2} />} />
          <Line
            dataKey="value"
            stroke={VIZ.series1}
            strokeWidth={2}
            dot={{ r: 4, fill: VIZ.series1, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <Legend color={VIZ.low} label={`< ${fmtNum(th.acwrLow, 1)} carga baja`} />
        <Legend color={VIZ.good} label={`${fmtNum(th.acwrLow, 1)}–${fmtNum(th.acwrHigh, 1)} óptimo`} />
        <Legend color={VIZ.warning} label={`${fmtNum(th.acwrHigh, 1)}–${fmtNum(th.acwrVeryHigh, 1)} pico de carga`} />
        <Legend color={VIZ.critical} label={`> ${fmtNum(th.acwrVeryHigh, 1)} pico alto`} />
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color, opacity: 0.7 }} />
      {label}
    </span>
  );
}
