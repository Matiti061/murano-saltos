import { CalendarDays, ChartLine, Home, Settings, Users } from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSettings } from '../db/settings';
import { useActiveTeam } from '../hooks/useActiveTeam';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Panel', icon: Home, end: true },
  { to: '/jugadoras', label: 'Jugadoras', icon: Users },
  { to: '/historial', label: 'Historial', icon: CalendarDays },
  { to: '/evolucion', label: 'Evolución', icon: ChartLine },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

export function TeamSelector({ className }: { className?: string }) {
  const { teams, teamId, setTeamId } = useActiveTeam();
  if (!teams || teams.length < 2) return null;
  return (
    <select
      value={teamId ?? ''}
      onChange={(e) => setTeamId(Number(e.target.value))}
      className={cx('h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-sm font-semibold text-white outline-none', className)}
      aria-label="Equipo"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id} className="text-slate-900">
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function Layout() {
  const settings = useSettings();
  const { team, teams } = useActiveTeam();

  return (
    <div className="min-h-screen md:flex">
      {/* Menú lateral en tablet / escritorio */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-indigo-950 text-indigo-100 md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="./icon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{settings.clubName}</p>
            <p className="text-xs text-indigo-300">Control de saltos</p>
          </div>
        </div>
        <div className="px-4 pb-3">
          <TeamSelector className="w-full" />
          {teams && teams.length === 1 && <p className="px-1 text-sm font-semibold text-indigo-200">{team?.name}</p>}
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-white/15 text-white' : 'text-indigo-200 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera en móvil */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-indigo-950 px-4 py-3 text-white md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src="./icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <p className="truncate text-sm font-bold">{settings.clubName}</p>
          </div>
          <TeamSelector className="max-w-[45vw]" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>

        {/* Menú inferior en móvil */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-indigo-700' : 'text-slate-500')
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
