import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { AuthGate } from './components/AuthGate';
import { TeamProvider } from './hooks/useActiveTeam';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { LiveSession } from './pages/LiveSession';
import { ManualEntry } from './pages/ManualEntry';
import { Players } from './pages/Players';
import { SessionFinish } from './pages/SessionFinish';
import { SessionReport } from './pages/SessionReport';
import { SessionSetup } from './pages/SessionSetup';
import { SettingsPage } from './pages/Settings';

// Las pantallas con gráficas cargan aparte para que la app arranque antes.
const PlayerDetail = lazy(() => import('./pages/PlayerDetail').then((m) => ({ default: m.PlayerDetail })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthGate>
          <TeamProvider>
            <Suspense fallback={null}>
              <Routes>
                {/* Pantalla de conteo a pantalla completa, sin menú. */}
                <Route path="/entreno/:id/vivo" element={<LiveSession />} />
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="jugadoras" element={<Players />} />
                  <Route path="jugadoras/:id" element={<PlayerDetail />} />
                  <Route path="entreno/nuevo" element={<SessionSetup />} />
                  <Route path="entreno/:id/finalizar" element={<SessionFinish />} />
                  <Route path="entreno/:id" element={<SessionReport />} />
                  <Route path="historial" element={<History />} />
                  <Route path="historial/manual" element={<ManualEntry />} />
                  <Route path="evolucion" element={<Stats />} />
                  <Route path="ajustes" element={<SettingsPage />} />
                  <Route path="*" element={<Dashboard />} />
                </Route>
              </Routes>
            </Suspense>
          </TeamProvider>
        </AuthGate>
      </ToastProvider>
    </HashRouter>
  );
}
