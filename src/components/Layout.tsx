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
      className={cx(
        'h-9 rounded-lg border border-orange-200 bg-orange-50 px-2 text-sm font-semibold text-orange-900 outline-none focus:ring-2 focus:ring-orange-300',
        className,
      )}
      aria-label="Equipo"
    >
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="h-1.5 bg-orange-500" />
        <div className="flex flex-col items-center px-5 pt-5 pb-4 text-center">
          <img src="./logo.jpg" alt="Logo del club" className="h-24 w-24 object-contain" />
          <p className="mt-1 text-sm font-bold text-slate-900">{settings.clubName}</p>
          <p className="text-xs font-semibold text-orange-600">Control de saltos</p>
        </div>
        <div className="px-4 pb-3">
          <TeamSelector className="w-full" />
          {teams && teams.length === 1 && <p className="text-center text-sm font-semibold text-slate-600">{team?.name}</p>}
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
                  isActive ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700',
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b-4 border-orange-500 bg-white px-4 py-2 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src="./logo.jpg" alt="" className="h-10 w-10 object-contain" />
            <p className="truncate text-sm font-bold text-slate-900">{settings.clubName}</p>
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
                cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold', isActive ? 'text-orange-600' : 'text-slate-500')
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
