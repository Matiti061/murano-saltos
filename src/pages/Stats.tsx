import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AcwrBadge } from '../components/AcwrBadge';
import { ChartCard, ColumnChart, HBarChart, VIZ } from '../components/charts';
import { PositionBubble } from '../components/PlayerBits';
import { Badge, Card, CardHeader, Disclaimer, PageHeader, Segmented } from '../components/ui';
import { POSITIONS } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { useTeamLoad } from '../hooks/useTeamLoad';
import { fmtDate, fmtDayMonth, fmtNum } from '../lib/format';
import { average, weeklyTotals, type AcwrResult, type LoadPoint } from '../lib/metrics';
import { NoTeam } from './Dashboard';

type SortKey = 'posicion' | 'acwr' | 'saltos';

const acwrRank = (a: AcwrResult) => a.ratio ?? -1;

export function Stats() {
  const { team, teams } = useActiveTeam();
  const summary = useTeamLoad(team?.id);
  const [sort, setSort] = useState<SortKey>('acwr');

  const charts = useMemo(() => {
    if (!summary) return null;
    const allPoints: LoadPoint[] = summary.flatMap((s) => s.points);
    const toWeekly = (metric: 'jumps' | 'srpe') =>
      weeklyTotals(allPoints, metric)
        .slice(-12)
        .map((w) => ({ label: fmtDayMonth(w.week), value: w.value, detail: `Semana del ${fmtDate(w.week)}` }));
    const byPosition = POSITIONS.map((pos) => {
      const values = summary.filter((s) => s.player.position === pos).flatMap((s) => s.points.map((p) => p.jumps));
      return { label: pos, value: values.length ? Math.round(average(values)!) : null };
    }).filter((d) => d.value != null);
    return {
      weeklyJumps: toWeekly('jumps'),
      weeklySrpe: toWeekly('srpe'),
      last7: summary.map((s) => ({ label: s.player.name, value: s.jumps7d })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
      byPosition,
    };
  }, [summary]);

  const rows = useMemo(() => {
    if (!summary) return [];
    const list = [...summary];
    if (sort === 'acwr') list.sort((a, b) => acwrRank(b.acwrJumps) - acwrRank(a.acwrJumps));
    if (sort === 'saltos') list.sort((a, b) => b.jumps7d - a.jumps7d);
    return list;
  }, [summary, sort]);

  if (teams && !team) return <NoTeam />;
  if (!charts) return null;

  return (
    <>
      <PageHeader title="Evolución" subtitle={`${team?.name} · cargas del equipo y semáforo de riesgo`} />

      <Card className="mb-5">
        <CardHeader
          title="Semáforo de carga"
          subtitle="ACWR = carga de los últimos 7 días / media semanal de las últimas 4 semanas"
          action={
            <Segmented
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'acwr', label: 'ACWR' },
                { value: 'saltos', label: 'Saltos' },
                { value: 'posicion', label: 'Posición' },
              ]}
            />
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Jugadora</th>
                <th className="px-3 py-2 text-right">Saltos 7 d</th>
                <th className="px-3 py-2 text-right">Media semanal</th>
                <th className="px-3 py-2 text-center">ACWR saltos</th>
                <th className="px-3 py-2 text-right">sRPE 7 d</th>
                <th className="px-3 py-2 text-center">ACWR sRPE</th>
                <th className="px-3 py-2 text-center">Wellness</th>
                <th className="px-3 py-2 text-center">Molestias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.player.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/jugadoras/${s.player.id}`} className="flex items-center gap-2">
                      <PositionBubble player={s.player} size="sm" />
                      <span className="font-semibold whitespace-nowrap text-slate-900">{s.player.name}</span>
                      <span className="hidden text-xs text-slate-500 sm:inline">{s.player.position}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(s.jumps7d)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(s.acwrJumps.chronicWeekly)}</td>
                  <td className="px-3 py-2 text-center">
                    <AcwrBadge result={s.acwrJumps} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(s.srpe7d)}</td>
                  <td className="px-3 py-2 text-center">
                    <AcwrBadge result={s.acwrSrpe} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.recentWellness ? (
                      <Badge tone={s.recentWellness.low.length || s.recentWellness.drop ? 'amber' : 'slate'}>{s.recentWellness.total}/20</Badge>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.activeComplaints.length ? <Badge tone="red">{s.activeComplaints.length}</Badge> : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          Verde: zona óptima · Ámbar: pico de carga · Rojo: pico alto (más riesgo) · Azul: carga baja (desentrenamiento) ·
          Gris: menos de 3 semanas de datos.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Saltos del equipo por semana" subtitle="Suma de todas las jugadoras · últimas 12 semanas">
          <ColumnChart data={charts.weeklyJumps} unit="saltos" />
        </ChartCard>
        <ChartCard title="Carga interna del equipo por semana" subtitle="Suma de RPE × minutos">
          <ColumnChart data={charts.weeklySrpe} unit="UA" color={VIZ.series2} />
        </ChartCard>
        <ChartCard title="Saltos en los últimos 7 días" subtitle="Por jugadora">
          <HBarChart data={charts.last7} unit="saltos" />
        </ChartCard>
        <ChartCard title="Media de saltos por sesión" subtitle="Por posición, todo el histórico">
          <HBarChart data={charts.byPosition} unit="saltos/sesión" />
        </ChartCard>
      </div>

      <Disclaimer />
    </>
  );
}
