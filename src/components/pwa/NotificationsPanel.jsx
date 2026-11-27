import React, { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, CheckCircle2, Download, Smartphone, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { Button, Card, IconButton } from "../ui/primitives.jsx";
import { useDismissed } from "../../pwa/pwa.js";
import { currentSubscription, disablePush, enablePush, loadNotificationSettings, pushAvailability, saveNotificationSettings } from "../../pwa/push.js";
import { useInstallApp } from "./InstallApp.jsx";

const REASONS = {
  denied: "Bloqueaste los avisos en este navegador. Para activarlos, permítelos desde los ajustes del sitio (el candado junto a la dirección).",
  unsupported: "Este navegador no admite notificaciones.",
  "needs-install": "En iPhone, primero instala la app en tu pantalla de inicio y ábrela desde ahí.",
  unconfigured: "Las notificaciones todavía no están configuradas en el servidor.",
  server: "No pudimos registrar este dispositivo. Inténtalo de nuevo en un momento.",
  default: "No se concedió el permiso.",
};

// Estado de los avisos en este dispositivo para la cuenta actual.
export function usePush() {
  const auth = useAuth();
  const [availability, setAvailability] = useState(pushAvailability);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (auth.user) currentSubscription().then((subscription) => { if (active) setSubscribed(Boolean(subscription)); });
    return () => { active = false; };
  }, [auth.user?.id]);

  const enable = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const result = await enablePush();
      setAvailability(pushAvailability());
      if (result.ok) { setSubscribed(true); return true; }
      setMessage(REASONS[result.reason] || REASONS.server);
      return false;
    } catch (error) {
      console.error(error);
      setMessage(REASONS.server);
      return false;
    } finally { setBusy(false); }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true); setMessage("");
    try { await disablePush(); setSubscribed(false); } finally { setBusy(false); }
  }, []);

  return { signedIn: Boolean(auth.user), availability, subscribed, busy, message, enable, disable };
}

// Tarjeta previa en Inicio: el permiso del navegador solo se pide si tocan "Activar".
export function NotificationPrompt() {
  const push = usePush();
  const { isDismissed, dismiss } = useDismissed();
  const [done, setDone] = useState(false);
  if (!push.signedIn || isDismissed("push-prompt")) return null;
  if (done) return <div role="status" className="flex items-center gap-3 rounded-lg border border-teal/25 bg-teal/5 p-4 text-sm animate-fade-in-up">
    <CheckCircle2 size={20} className="text-teal shrink-0" aria-hidden="true" />Listo: te avisaremos el día de cobro y antes de tus pagos.
  </div>;
  if (push.availability !== "default" && !push.message) return null;

  return <div className="relative flex gap-3 rounded-lg border border-line bg-paper p-4 shadow-card animate-fade-in-up">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal text-paper"><BellRing size={19} aria-hidden="true" /></span>
    <div className="min-w-0 flex-1 pr-6">
      <p className="font-medium text-sm">¿Te avisamos el día de cobro?</p>
      <p className="text-xs text-ink-soft mt-0.5">Un aviso cuando te paguen, antes de tus pagos fijos y si un presupuesto se pasa. Máximo dos al día.</p>
      {push.message ? <p role="alert" className="text-xs text-brick mt-2">{push.message}</p> : null}
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" disabled={push.busy} onClick={async () => { if (await push.enable()) { setDone(true); dismiss("push-prompt"); } }}>{push.busy ? "Activando…" : "Activar avisos"}</Button>
        <Button size="sm" variant="ghost" onClick={() => dismiss("push-prompt")}>Ahora no</Button>
      </div>
    </div>
    <IconButton label="Cerrar sugerencia de avisos" className="absolute right-1.5 top-1.5" onClick={() => dismiss("push-prompt")}><X size={16} aria-hidden="true" /></IconButton>
  </div>;
}

const PREFS = [
  { key: "payday", label: "Día de cobro", hint: "Cuando toca registrar un ingreso recurrente." },
  { key: "due", label: "Pagos fijos", hint: "El día antes de que venza un gasto recurrente." },
  { key: "budgets", label: "Presupuestos", hint: "Cuando una partida pasa el 80 % o se excede." },
  { key: "inactivity", label: "Sin registrar", hint: "Si pasan 5 días sin movimientos." },
  { key: "month", label: "Cierre de mes", hint: "El último día del mes." },
];

// Configuración: instalar la app y gestionar los avisos.
export function AppAndNotificationsCard() {
  const auth = useAuth();
  const install = useInstallApp();
  const push = usePush();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (auth.user && push.availability !== "unconfigured") loadNotificationSettings().then((data) => { if (active) setPrefs(data); }).catch(() => {});
    return () => { active = false; };
  }, [auth.user?.id, push.subscribed, push.availability]);

  async function toggle(key) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setSaving(true);
    try { setPrefs(await saveNotificationSettings(next)); } catch { setPrefs(prefs); } finally { setSaving(false); }
  }

  return <Card title="App y notificaciones">
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal/10 text-teal"><Smartphone size={18} aria-hidden="true" /></span>
        <div className="flex-1">
          <p className="text-sm font-medium">Instalar en tu dispositivo</p>
          {install.standalone
            ? <p className="text-xs text-ink-soft mt-0.5">Ya estás usando la app instalada.</p>
            : install.canInstall
              ? <><p className="text-xs text-ink-soft mt-0.5">Ábrela desde tu pantalla de inicio, a pantalla completa.</p><Button size="sm" className="mt-2" onClick={install.start}><Download size={15} aria-hidden="true" />Instalar app</Button></>
              : <p className="text-xs text-ink-soft mt-0.5">Abre la app en Chrome (Android o computadora) o en Safari (iPhone) para instalarla.</p>}
        </div>
      </div>

      <div className="flex items-start gap-3 border-t border-line pt-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">{push.subscribed ? <BellRing size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Avisos en este dispositivo</p>
          {!push.signedIn ? <p className="text-xs text-ink-soft mt-0.5">Los avisos necesitan una cuenta. En modo invitado verás los recordatorios al abrir la app.</p>
            : push.subscribed ? <>
              <p className="text-xs text-ink-soft mt-0.5">Activados. Llegan cerca de las 9:00 de la mañana.</p>
              <Button size="sm" variant="secondary" className="mt-2" disabled={push.busy} onClick={push.disable}>Desactivar en este dispositivo</Button>
            </> : ["default", "granted"].includes(push.availability) ? <>
              <p className="text-xs text-ink-soft mt-0.5">Te avisamos aunque no abras la app.</p>
              <Button size="sm" className="mt-2" disabled={push.busy} onClick={push.enable}>{push.busy ? "Activando…" : "Activar avisos"}</Button>
            </> : <p className="text-xs text-ink-soft mt-0.5">{REASONS[push.availability]}</p>}
          {push.message ? <p role="alert" className="text-xs text-brick mt-2">{push.message}</p> : null}
        </div>
      </div>

      {push.signedIn && prefs ? <fieldset className="border-t border-line pt-4" disabled={saving}>
        <legend className="sr-only">Qué avisos recibir</legend>
        <p className="text-sm font-medium mb-1">Qué avisos recibir</p>
        <p className="text-xs text-ink-soft mb-3">Se aplica a todos tus dispositivos{prefs.devices ? ` (${prefs.devices} activo${prefs.devices > 1 ? "s" : ""})` : ""}.</p>
        <ul className="flex flex-col gap-1">
          {PREFS.map((pref) => <li key={pref.key}>
            <label className="flex items-center justify-between gap-3 rounded px-1 py-2 cursor-pointer hover:bg-paper-raised/60">
              <span><span className="block text-sm">{pref.label}</span><span className="block text-xs text-ink-soft">{pref.hint}</span></span>
              <input type="checkbox" role="switch" checked={Boolean(prefs[pref.key])} onChange={() => toggle(pref.key)} className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-line-strong/60 transition-colors checked:bg-teal relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2" />
            </label>
          </li>)}
        </ul>
      </fieldset> : null}
    </div>
    {install.guide}
  </Card>;
}
