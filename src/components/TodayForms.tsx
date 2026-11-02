import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, MessageSquare, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { latestResponsesOn } from '../db/forms';
import { sortPlayers } from '../db/players';
import { db } from '../db/schema';
import { useSettings } from '../db/settings';
import { hasCompleteWellness } from '../lib/forms/parse';
import { DISCOMFORT_LABEL } from '../lib/forms/zones';
import { todayISO } from '../lib/format';
import { wellnessLowItems, wellnessTotal } from '../lib/metrics';
import { PositionBubble } from './PlayerBits';
import { Badge, ButtonLink, Card, CardHeader } from './ui';

/** Resumen de las encuestas de hoy en el Panel (solo si el equipo ya usa encuestas). */
export function TodayForms({ teamId }: { teamId: string }) {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const used = (await db.formResponses.where('teamId').equals(teamId).count()) > 0;
    if (!used) return null;
    const [responses, players] = await Promise.all([
      latestResponsesOn(teamId, todayISO()),
      db.players.where('teamId').equals(teamId).filter((p) => !p.archived && p.status !== 'baja').toArray(),
    ]);
    return { responses, players: sortPlayers(players) };
  }, [teamId]);

  if (!data) return null;
  const pre = data.responses.filter((r) => r.kind === 'pre');
  const rpe = data.responses.filter((r) => r.kind === 'rpe');
  const answered = new Set(pre.map((r) => r.playerId));
  const missing = data.players.filter((p) => !answered.has(p.id!));
  const byId = new Map(data.players.map((p) => [p.id!, p]));
  const flagged = pre.filter((r) => {
    const w = r.values.wellness;
    const low = hasCompleteWellness(w) ? wellnessLowItems(w, settings.wellnessItemAlert) : [];
    return r.values.discomfort || r.values.note || low.length;
  });

  return (
    <Card className="mb-5">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ClipboardList size={18} className="text-orange-600" /> Encuesta de hoy
          </span>
        }
        subtitle={`Pre-entreno: ${pre.length} de ${data.players.length} respondieron${rpe.length ? ` · RPE: ${rpe.length}` : ''}`}
        action={
          <ButtonLink to="/encuestas" size="sm" variant="secondary">
            <Upload size={16} /> Subir respuestas
          </ButtonLink>
        }
      />
      {flagged.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {flagged.map((r) => {
            const p = byId.get(r.playerId);
            const w = r.values.wellness;
            const low = hasCompleteWellness(w) ? wellnessLowItems(w, settings.wellnessItemAlert) : [];
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                {p && <PositionBubble player={p} size="sm" />}
                <div className="min-w-0 flex-1">
                  <Link to={p ? `/jugadoras/${p.id}` : '#'} className="font-semibold text-slate-900">
                    {p?.name ?? 'Jugadora'}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {hasCompleteWellness(w) && <Badge tone={low.length ? 'amber' : 'slate'}>{wellnessTotal(w)}/20</Badge>}
                    {low.length > 0 && <span className="text-xs text-amber-800">{low.join(', ')}</span>}
                    {r.values.discomfort ? (
                      <Badge tone={r.values.discomfort >= 3 ? 'red' : 'amber'}>
                        {DISCOMFORT_LABEL[r.values.discomfort]}
                        {r.values.discomfortZone ? `: ${r.values.discomfortZone}` : ''}
                      </Badge>
                    ) : null}
                  </div>
                  {r.values.note && (
                    <p className="mt-1 flex items-start gap-1.5 text-slate-700">
                      <MessageSquare size={14} className="mt-0.5 shrink-0 text-orange-600" /> «{r.values.note}»
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Sin responder: {missing.map((p) => p.name).join(', ')}
        </p>
      )}
    </Card>
  );
}
