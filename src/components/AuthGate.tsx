import type { DXCAlert, DXCUserInteraction } from 'dexie-cloud-addon';
import { useObservable } from 'dexie-react-hooks';
import { Loader2, LogIn, Mail } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { db } from '../db/schema';
import { compactFinishedLeftovers } from '../db/sessions';
import { CLUB_LOGO_URL } from '../lib/clubLogo';
import { Modal } from './Modal';
import { Button, Input, cx } from './ui';

/** Textos en español para los avisos del servicio de sincronización. */
function alertText(alert: DXCAlert): string {
  switch (alert.messageCode) {
    case 'OTP_SENT':
      return `Te enviamos un código a ${alert.messageParams?.email ?? 'tu correo'}. Revisa también la carpeta de spam.`;
    case 'INVALID_OTP':
      return 'El código no es correcto o ha caducado. Revísalo e inténtalo de nuevo.';
    case 'INVALID_EMAIL':
      return 'Ese correo no es válido.';
    case 'LICENSE_LIMIT_REACHED':
    case 'NO_SEATS_AVAILABLE':
      return 'Se alcanzó el límite de usuarios del plan de Dexie Cloud.';
    case 'USER_DEACTIVATED':
      return 'Este usuario está desactivado.';
    case 'USER_NOT_REGISTERED':
    case 'USER_NOT_ACCEPTED':
      return 'Este correo no tiene acceso a los datos del club.';
    case 'LOGOUT_CONFIRMATION':
      return `Hay ${alert.messageParams?.numUnsyncedChanges ?? 'algunos'} cambios que aún no se han subido a la nube. Si cierras sesión ahora se perderán.`;
    default:
      return alert.message;
  }
}

const ALERT_STYLES: Record<DXCAlert['type'], string> = {
  error: 'bg-red-50 text-red-800 border-red-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  info: 'bg-sky-50 text-sky-900 border-sky-200',
};

function Alerts({ alerts }: { alerts: DXCAlert[] }) {
  if (!alerts?.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <p key={i} className={cx('rounded-xl border px-3 py-2 text-sm', ALERT_STYLES[a.type])}>
          {alertText(a)}
        </p>
      ))}
    </div>
  );
}

/** Formulario según el paso que pida Dexie Cloud (correo, código, aviso o confirmación). */
function InteractionForm({ interaction }: { interaction: DXCUserInteraction }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    setValue('');
    setSending(false);
  }, [interaction]);

  const submit = (params: Record<string, string>) => {
    setSending(true);
    interaction.onSubmit(params);
  };

  if (interaction.type === 'email') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit({ email: value.trim().toLowerCase() });
        }}
      >
        <Alerts alerts={interaction.alerts} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Correo electrónico</span>
          <Input type="email" inputMode="email" autoComplete="email" autoFocus required value={value} onChange={(e) => setValue(e.target.value)} placeholder="tucorreo@ejemplo.com" />
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />} Enviarme un código
        </Button>
        <p className="text-center text-xs text-slate-500">Sin contraseñas: te llegará un código de un solo uso.</p>
      </form>
    );
  }

  if (interaction.type === 'otp') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) submit({ otp: value.trim().toUpperCase() });
        }}
      >
        <Alerts alerts={interaction.alerts} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Código recibido</span>
          <Input
            autoFocus
            required
            autoComplete="one-time-code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-center font-mono text-xl tracking-[0.3em] uppercase"
          />
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />} Entrar
        </Button>
        <Button variant="ghost" className="w-full" onClick={interaction.onCancel}>
          Usar otro correo
        </Button>
      </form>
    );
  }

  // Avisos, confirmación de cierre de sesión u otros pasos genéricos.
  const isLogout = interaction.type === 'logout-confirmation';
  return (
    <div className="space-y-4">
      <Alerts alerts={interaction.alerts} />
      <div className="flex flex-wrap justify-end gap-2">
        {interaction.cancelLabel != null && (
          <Button variant="secondary" onClick={interaction.onCancel}>
            Cancelar
          </Button>
        )}
        <Button variant={isLogout ? 'danger' : 'primary'} onClick={() => submit({})}>
          {isLogout ? 'Cerrar sesión igualmente' : 'Aceptar'}
        </Button>
      </div>
    </div>
  );
}

function LoginScreen({ interaction }: { interaction?: DXCUserInteraction }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="h-1.5 bg-orange-500" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <img src={CLUB_LOGO_URL} alt="Logo del club" className="mx-auto h-32 w-32 object-contain" />
          <h1 className="mt-2 text-center text-2xl font-bold text-slate-900">Control de saltos</h1>
          <p className="mt-1 mb-6 text-center text-sm text-slate-500">
            Inicia sesión para ver los datos del club en este dispositivo. Solo hace falta una vez.
          </p>
          {interaction ? (
            <InteractionForm interaction={interaction} />
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-slate-500">
                <Loader2 className="mr-1 inline animate-spin" size={16} /> Conectando…
              </p>
              <Button variant="secondary" onClick={() => void db.cloud.login()}>
                <LogIn size={18} /> Iniciar sesión
              </Button>
            </div>
          )}
        </div>
      </div>
      <p className="p-4 text-center text-xs text-slate-400">La primera vez necesitas internet. Después funciona también sin conexión.</p>
    </div>
  );
}

/** Muestra la pantalla de acceso hasta que hay sesión iniciada; después, la app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const user = useObservable(db.cloud.currentUser);
  const interaction = useObservable(db.cloud.userInteraction);

  useEffect(() => {
    // Abrir la base dispara el inicio de sesión (requireAuth) y la sincronización.
    db.open().catch(() => {
      // Los errores de acceso se muestran como avisos en la pantalla de inicio de sesión.
    });
  }, []);

  // Tras cada sincronización, resume los toques que hayan llegado tarde a sesiones ya finalizadas.
  const loggedIn = !!user?.isLoggedIn;
  useEffect(() => {
    if (!loggedIn) return;
    let timer: number | undefined;
    const sub = db.cloud.events.syncComplete.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void compactFinishedLeftovers().catch(() => {}), 2000);
    });
    return () => {
      window.clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [loggedIn]);

  if (!user || user.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <img src={CLUB_LOGO_URL} alt="" className="h-24 w-24 animate-pulse object-contain" />
      </div>
    );
  }

  if (!user.isLoggedIn) return <LoginScreen interaction={interaction} />;

  return (
    <>
      {children}
      {interaction && (
        <Modal open title={interaction.type === 'logout-confirmation' ? 'Cerrar sesión' : 'Aviso'} onClose={interaction.onCancel}>
          <InteractionForm interaction={interaction} />
        </Modal>
      )}
    </>
  );
}
