import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ChevronRight, DatabaseBackup, HeartPulse, Play, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AcwrBadge } from '../components/AcwrBadge';
import { PositionBubble } from '../components/PlayerBits';
import { useToast } from '../components/Toast';
import { Badge, Button, ButtonLink, Card, CardHeader, Disclaimer, Input, StatTile } from '../components/ui';
import { complaintLabel } from '../db/complaints';
import { createTeam } from '../db/players';
import { db, isStoragePersisted } from '../db/schema';
import { getActiveSession, isPresent } from '../db/sessions';
import { useSettings } from '../db/settings';
import { SESSION_TYPE_LABEL } from '../db/types';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { useTeamLoad, type PlayerLoadSummary } from '../hooks/useTeamLoad';
import { exportBackup } from '../lib/backup';
import { seedDemo } from '../lib/demo';
import { capitalize, fmtDateLong, fmtNum, fmtTime, todayISO } from '../lib/format';

const WEEK_MS = 7 * 86_400_000;

export function NoTeam() {
  const { teams, setTeamId } = useActiveTeam();
  const toast = useToast();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  if (!teams) return null;

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card className="p-6 sm:p-8">
        <img src="./logo.jpg" alt="Logo del club" className="mx-auto mb-4 h-28 w-28 object-contain" />
        <h1 className="text-2xl font-bold text-slate-900">Control de saltos</h1>
        <p className="mt-2 text-slate-600">
          Cuenta los saltos de cada jugadora en los entrenamientos, guarda el histórico y detecta picos de carga para
          ayudar a prevenir lesiones. Para empezar, crea el equipo.
        </p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return toast('Escribe el nombre del equipo', 'warning');
            setTeamId(await createTeam(name));
            toast('Equipo creado', 'success');
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Senior femenino, Juvenil…" autoFocus />
          <Button type="submit">
            <Plus size={18} /> Crear
          </Button>
        </form>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-sm text-slate-500">¿Quieres ver cómo funciona antes?</p>
          <Button
            variant="secondary"
            className="mt-2"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setTeamId(await seedDemo());
              setLoading(false);
              toast('Datos de ejemplo cargados', 'success');
            }}
          >
            <Sparkles size={18} /> {loading ? 'Cargando…' : 'Cargar datos de ejemplo'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

interface AlertItem {
  key: string;
  level: 'alta' | 'media';
  summary: PlayerLoadSummary;
  text: string;
}

function buildAlerts(summary: PlayerLoadSummary[]): AlertItem[] {
  const out: AlertItem[] = [];
  for (const s of summary) {
    const id = s.player.id!;
    if (s.acwrJumps.status === 'muy_alto' || s.acwrJumps.status === 'alto') {
      out.push({
        key: `aj${id}`,
        level: s.acwrJumps.status === 'muy_alto' ? 'alta' : 'media',
        summary: s,
        text: `Pico de saltos: ${fmtNum(s.acwrJumps.acute)} en 7 días frente a una media de ${fmtNum(s.acwrJumps.chronicWeekly)}/semana`,
      });
    }
    if (s.acwrSrpe.status === 'muy_alto' || s.acwrSrpe.status === 'alto') {
      out.push({
        key: `as${id}`,
        level: s.acwrSrpe.status === 'muy_alto' ? 'alta' : 'media',
        summary: s,
        text: 'Pico de carga interna (RPE × minutos)',
      });
    }
    for (const c of s.activeComplaints) {
      out.push({
        key: `c${c.id}`,
        level: c.kind === 'lesion' || c.intensity >= 7 ? 'alta' : 'media',
        summary: s,
        text: `${c.kind === 'lesion' ? 'Lesión' : 'Molestia'} activa: ${complaintLabel(c).toLowerCase()}`,
      });
    }
    if (s.recentWellness && (s.recentWellness.low.length || s.recentWellness.drop)) {
      out.push({
        key: `w${id}`,
        level: 'media',
        summary: s,
        text: s.recentWellness.low.length
          ? `Wellness bajo: ${s.recentWellness.low.join(', ').toLowerCase()}`
          : 'Wellness claramente por debajo de su media',
      });
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'alta' ? -1 : 1));
}

export function Dashboard() {
  const { team, teams } = useActiveTeam();
  const settings = useSettings();
  const toast = useToast();
  const summary = useTeamLoad(team?.id);
  const active = useLiveQuery(() => getActiveSession(team?.id), [team?.id]);
  const recent = useLiveQuery(async () => {
    if (!team) return [];
    const sessions = (await db.sessions.where('teamId').equals(team.id!).toArray())
      .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)
      .slice(0, 5);
    const atts = await db.attendance.where('sessionId').anyOf(sessions.map((s) => s.id!)).toArray();
    return sessions.map((s) => {
      const mine = atts.filter((a) => a.sessionId === s.id && isPresent(a.status));
      return { session: s, present: mine.length, jumps: mine.reduce((acc, a) => acc + a.jumps, 0) };
    });
  }, [team?.id]);
  const hasData = useLiveQuery(async () => (await db.sessions.count()) > 0, []);
  const [persisted, setPersisted] = useState(true);
  useEffect(() => {
    void isStoragePersisted().then(setPersisted);
  }, []);

  if (!teams) return null;
  if (!team) return <NoTeam />;

  const alerts = summary ? buildAlerts(summary) : [];
  const jumps7d = summary?.reduce((a, s) => a + s.jumps7d, 0) ?? 0;
  const rehab = summary?.filter((s) => s.player.status === 'readaptacion' || s.player.status === 'lesionada') ?? [];
  const needsBackup = hasData && (!settings.lastBackupAt || Date.now() - settings.lastBackupAt > WEEK_MS);

  return (
    <>
      {team.demo && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <span>
            <Sparkles size={16} className="mr-1 inline" /> Estás viendo el <b>equipo de ejemplo</b>. Puedes borrarlo en Ajustes cuando quieras.
          </span>
          <Link to="/ajustes" className="font-semibold underline">
            Ajustes
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-orange-700">{capitalize(fmtDateLong(todayISO()))}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{team.name}</h1>
        </div>
        {active ? (
          <ButtonLink to={`/entreno/${active.id}/vivo`} size="lg" variant="success">
            <Play size={20} /> Continuar entrenamiento ({fmtTime(active.startedAt)})
          </ButtonLink>
        ) : (
          <ButtonLink to="/entreno/nuevo" size="lg">
            <Play size={20} /> Nuevo entrenamiento
          </ButtonLink>
        )}
      </div>

      {needsBackup && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 border-amber-300 bg-amber-50 p-4">
          <DatabaseBackup className="text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            {settings.lastBackupAt ? 'Hace más de una semana de la última copia de seguridad.' : 'Aún no has hecho ninguna copia de seguridad.'}{' '}
            Los datos solo están en este dispositivo: guarda una copia en Drive, correo o un USB.
          </p>
          <Button
            size="sm"
            onClick={async () => {
              await exportBackup();
              toast('Copia descargada', 'success');
            }}
          >
            Hacer copia ahora
          </Button>
        </Card>
      )}
      {!persisted && hasData && (
        <p className="mb-4 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} /> Consejo: instala la app en la pantalla de inicio para que el navegador no borre los datos.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Saltos del equipo (7 días)" value={fmtNum(jumps7d)} />
        <StatTile label="Jugadoras" value={summary?.length ?? '–'} hint={rehab.length ? `${rehab.length} en readaptación o lesionadas` : undefined} />
        <StatTile label="Alertas" value={alerts.length} tone={alerts.some((a) => a.level === 'alta') ? 'red' : alerts.length ? 'amber' : undefined} />
        <StatTile label="Molestias activas" value={summary?.reduce((a, s) => a + s.activeComplaints.length, 0) ?? 0} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" /> Alertas de carga y salud
              </span>
            }
            subtitle="Picos de carga (ACWR), molestias activas y wellness bajo"
          />
          {alerts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Sin alertas ahora mismo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link to={`/jugadoras/${a.summary.player.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <PositionBubble player={a.summary.player} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{a.summary.player.name}</p>
                      <p className="text-sm text-slate-600">{a.text}</p>
                    </div>
                    {a.key.startsWith('a') ? (
                      <AcwrBadge result={a.key.startsWith('aj') ? a.summary.acwrJumps : a.summary.acwrSrpe} />
                    ) : a.key.startsWith('c') ? (
                      <HeartPulse size={18} className={a.level === 'alta' ? 'text-red-600' : 'text-amber-500'} />
                    ) : (
                      <Badge tone="amber">{a.summary.recentWellness?.total}/20</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Últimas sesiones"
            action={
              <Link to="/historial" className="text-sm font-semibold text-orange-700">
                Ver todas
              </Link>
            }
          />
          {recent && recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Todavía no hay sesiones.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent?.map(({ session: s, present, jumps }) => (
                <li key={s.id}>
                  <Link to={`/entreno/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {capitalize(fmtDateLong(s.date)).split(' de 20')[0]}
                        {s.status === 'en_curso' && (
                          <Badge tone="amber" className="ml-2">
                            En curso
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {SESSION_TYPE_LABEL[s.type]} · {present} jugadoras
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 tabular-nums">{jumps}</span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Disclaimer />
    </>
  );
}
